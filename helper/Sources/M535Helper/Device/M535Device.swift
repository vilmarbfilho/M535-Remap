import Foundation
import IOKit
import IOKit.hid

/// M535 Control IDs (HID++ ReprogControlsV4), found with diagnostics/m535diag.
enum CID {
    static let middle: UInt16 = 0x0052
    static let tiltLeft: UInt16 = 0x00CE
    static let tiltRight: UInt16 = 0x00CF
    static let gesture: UInt16 = 0x00D0
    static let all: [UInt16] = [middle, tiltLeft, tiltRight, gesture]
}

/// setCidReporting flags (0x1B04 fn 3).
enum ReportingFlags {
    static let divert: UInt8 = 0x03       // divert + dvalid
    static let divertRawXY: UInt8 = 0x33  // divert + dvalid + rawXY + rvalid
    static let reset: UInt8 = 0x22        // dvalid + rvalid with both off (0x02 would leave rawXY on)
}

enum HidppError: Error, CustomStringConvertible {
    case timeout, notConnected
    case protocolError(UInt8)
    case writeFailed(IOReturn)

    var description: String {
        switch self {
        case .timeout: return "timeout"
        case .notConnected: return "disconnected"
        case .protocolError(let c): return String(format: "HID++ error 0x%02X", c)
        case .writeFailed(let r): return String(format: "SetReport failed 0x%08X", UInt32(bitPattern: r))
        }
    }
}

/// Connection to the Logitech M535 via IOHID + HID++ 2.0 (direct Bluetooth, device index 0xFF).
///
/// Lessons from the diagnostics:
///  - Always use the LONG report (0x11, 20 bytes): with the short report the firmware reads garbage for
///    the missing parameters and randomly replies with error 0x02.
///  - getCidReporting returns the CID in an inconsistent format → we don't trust readback;
///    we keep the desired state and reapply it on every connection.
final class M535Device {
    static let vendorID = 0x046D
    static let productID = 0xB016
    private static let deviceIndex: UInt8 = 0xFF
    private static let softwareID: UInt8 = 0x0A
    private static let longReportID: UInt8 = 0x11

    var onStateChange: (() -> Void)?
    var onPressed: ((Set<UInt16>) -> Void)?
    var onMotion: ((Int, Int) -> Void)?
    /// Native (non-diverted) report 0x02: buttons (bit0 left, bit1 right, bit2 middle) and wheel (+ = up).
    var onNativeButtons: ((UInt8) -> Void)?
    var onNativeWheel: ((Int) -> Void)?

    private(set) var managerOpen = false
    private(set) var isReady = false
    private(set) var productName: String?
    private(set) var batteryPercent: Int?

    private var manager: IOHIDManager?
    private var device: IOHIDDevice?
    private var reprogIndex: UInt8?
    private var batteryIndex: UInt8?
    private var desired: [UInt16: UInt8] = [:]
    private let reportBuffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 64)
    private var batteryTimer: Timer?
    private var lastSelfHeal = Date.distantPast
    private var lastNativeButtons: UInt8 = 0
    private var loggedOpenFailure = false

    private struct Request {
        let feature: UInt8
        let function: UInt8
        let params: [UInt8]
        let completion: ((Result<[UInt8], HidppError>) -> Void)?
    }
    private var queue: [Request] = []
    private var inFlight: Request?
    private var timeoutWork: DispatchWorkItem?

    var isConnected: Bool { device != nil }

    // MARK: Lifecycle

    func start() {
        let m = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
        IOHIDManagerSetDeviceMatching(m, [kIOHIDVendorIDKey: Self.vendorID, kIOHIDProductIDKey: Self.productID] as CFDictionary)
        let ctx = Unmanaged.passUnretained(self).toOpaque()
        IOHIDManagerRegisterDeviceMatchingCallback(m, { ctx, _, _, dev in
            guard let ctx else { return }
            Unmanaged<M535Device>.fromOpaque(ctx).takeUnretainedValue().attached(dev)
        }, ctx)
        IOHIDManagerRegisterDeviceRemovalCallback(m, { ctx, _, _, dev in
            guard let ctx else { return }
            Unmanaged<M535Device>.fromOpaque(ctx).takeUnretainedValue().removed(dev)
        }, ctx)
        // commonModes: keeps receiving events while menus are open / during shutdown.
        IOHIDManagerScheduleWithRunLoop(m, CFRunLoopGetMain(), CFRunLoopMode.commonModes.rawValue)
        manager = m
        tryOpen()
    }

    /// Tries to open the IOHIDManager (fails without the Input Monitoring permission). Can be called again.
    @discardableResult
    func tryOpen() -> Bool {
        guard let m = manager else { return false }
        if managerOpen { return true }
        let r = IOHIDManagerOpen(m, IOOptionBits(kIOHIDOptionsTypeNone))
        managerOpen = (r == kIOReturnSuccess)
        if managerOpen {
            Log.info("IOHIDManager opened")
            loggedOpenFailure = false
            if let set = IOHIDManagerCopyDevices(m) as? Set<IOHIDDevice> { set.forEach(attached) }
        } else if !loggedOpenFailure {
            loggedOpenFailure = true
            Log.warn(String(format: "IOHIDManagerOpen failed (0x%08X) — missing Input Monitoring?", UInt32(bitPattern: r)))
        }
        onStateChange?()
        return managerOpen
    }

    private func attached(_ dev: IOHIDDevice) {
        if let d = device {
            if CFEqual(d, dev) { return }
            Log.info("Another M535 found; keeping the first one")
            return
        }
        let r = IOHIDDeviceOpen(dev, IOOptionBits(kIOHIDOptionsTypeNone))
        guard r == kIOReturnSuccess else {
            Log.warn(String(format: "IOHIDDeviceOpen failed (0x%08X)", UInt32(bitPattern: r)))
            return
        }
        device = dev
        productName = IOHIDDeviceGetProperty(dev, kIOHIDProductKey as CFString) as? String
        IOHIDDeviceRegisterInputReportCallback(dev, reportBuffer, 64, { ctx, _, _, _, _, report, len in
            guard let ctx else { return }
            Unmanaged<M535Device>.fromOpaque(ctx).takeUnretainedValue()
                .handleReport(Array(UnsafeBufferPointer(start: report, count: len)))
        }, Unmanaged.passUnretained(self).toOpaque())
        Log.info("Connected: \(productName ?? "M535")")
        onStateChange?()
        discover()
    }

    private func removed(_ dev: IOHIDDevice) {
        guard let d = device, CFEqual(d, dev) else { return }
        Log.info("Disconnected")
        device = nil
        isReady = false
        reprogIndex = nil
        batteryIndex = nil
        batteryPercent = nil
        batteryTimer?.invalidate()
        batteryTimer = nil
        failAll(.notConnected)
        onPressed?([])
        onStateChange?()
    }

    private func discover() {
        request(0x00, 0, [0x1B, 0x04]) { [weak self] r in
            guard let self else { return }
            guard case .success(let p) = r, let idx = p.first, idx != 0 else {
                Log.error("ReprogControlsV4 (0x1B04) unavailable: \(r)")
                return
            }
            self.reprogIndex = idx
            self.isReady = true
            Log.info("HID++ ready (ReprogControlsV4 at index \(idx))")
            self.applyDiversion()
            self.onStateChange?()
        }
        request(0x00, 0, [0x10, 0x00]) { [weak self] r in
            guard let self, case .success(let p) = r, let idx = p.first, idx != 0 else { return }
            self.batteryIndex = idx
            self.refreshBattery()
            let t = Timer(timeInterval: 300, repeats: true) { [weak self] _ in self?.refreshBattery() }
            RunLoop.main.add(t, forMode: .common)
            self.batteryTimer = t
        }
    }

    private func refreshBattery() {
        guard let idx = batteryIndex else { return }
        request(idx, 0, []) { [weak self] r in
            guard let self, case .success(let p) = r, let level = p.first else { return }
            if self.batteryPercent != Int(level) {
                self.batteryPercent = Int(level)
                self.onStateChange?()
            }
        }
    }

    // MARK: Control diversion

    /// Sets which CIDs should be diverted (cid → flags). Missing CIDs are restored.
    func setDesiredDiversion(_ d: [UInt16: UInt8]) {
        let changed = d != desired
        desired = d
        if isReady && changed { applyDiversion() }
    }

    private func applyDiversion() {
        guard let idx = reprogIndex else { return }
        for cid in CID.all {
            let flags = desired[cid] ?? ReportingFlags.reset
            request(idx, 3, [UInt8(cid >> 8), UInt8(cid & 0xFF), flags, 0, 0]) { r in
                if case .failure(let e) = r { Log.error(String(format: "setCidReporting 0x%04X failed: ", cid) + e.description) }
            }
        }
        let desc = desired.keys.sorted().map { String(format: "0x%04X=0x%02X", $0, desired[$0]!) }.joined(separator: " ")
        Log.info("Diversion applied: [\(desc)]")
    }

    /// Restores all controls synchronously (used on shutdown; does not depend on the runloop).
    func restoreSync() {
        guard let dev = device, let idx = reprogIndex else { return }
        for cid in CID.all {
            let pkt = packet(idx, 3, [UInt8(cid >> 8), UInt8(cid & 0xFF), ReportingFlags.reset, 0, 0])
            IOHIDDeviceSetReport(dev, kIOHIDReportTypeOutput, CFIndex(Self.longReportID), pkt, pkt.count)
            usleep(30_000)
        }
        Log.info("Controls restored to factory defaults")
    }

    // MARK: Reports

    private func handleReport(_ b: [UInt8]) {
        guard let id = b.first else { return }

        if id == 0x10 || id == 0x11 {
            guard b.count >= 4 else { return }
            let feat = b[2], fnSw = b[3]
            if let req = inFlight {
                let expected = (req.function << 4) | Self.softwareID
                if feat == req.feature && fnSw == expected {
                    finish(.success(Array(b.dropFirst(4))))
                    return
                }
                if (feat == 0xFF || feat == 0x8F) && b.count >= 6 && b[3] == req.feature && b[4] == expected {
                    finish(.failure(.protocolError(b[5])))
                    return
                }
            }
            if let idx = reprogIndex, feat == idx, fnSw & 0x0F == 0 {
                let p = Array(b.dropFirst(4))
                switch fnSw >> 4 {
                case 0:  // divertedButtonsEvent: up to 4 pressed CIDs
                    var pressed = Set<UInt16>()
                    for i in stride(from: 0, to: min(8, p.count - 1), by: 2) {
                        let c = UInt16(p[i]) << 8 | UInt16(p[i + 1])
                        if c != 0 { pressed.insert(c) }
                    }
                    onPressed?(pressed)
                case 1 where p.count >= 4:  // divertedRawMouseXYEvent
                    let dx = Int(Int16(bitPattern: UInt16(p[0]) << 8 | UInt16(p[1])))
                    let dy = Int(Int16(bitPattern: UInt16(p[2]) << 8 | UInt16(p[3])))
                    onMotion?(dx, dy)
                default: break
                }
            }
            return
        }

        if id == 0x02 && b.count >= 7 {
            if b[1] != lastNativeButtons {
                lastNativeButtons = b[1]
                onNativeButtons?(b[1])
            }
            let wheel = Int(Int8(bitPattern: b[5]))
            if wheel != 0 { onNativeWheel?(wheel) }
        }

        // Self-healing: if the gesture button's native shortcut (⌃↑ in the keyboard report) or a diverted middle
        // click arrives through the normal HID path, the mouse lost the diversion (e.g. it woke from sleep).
        let leakedKeyboard = id == 0x04 && desired[CID.gesture] != nil && b.dropFirst(3).contains { $0 != 0 }
        let leakedMiddle = id == 0x02 && b.count > 1 && b[1] & 0x04 != 0 && desired[CID.middle] != nil
        if (leakedKeyboard || leakedMiddle) && isReady && Date().timeIntervalSince(lastSelfHeal) > 3 {
            lastSelfHeal = Date()
            Log.warn("Mouse lost the diversion — reapplying")
            applyDiversion()
        }
    }

    // MARK: HID++ request queue (one at a time, with timeout)

    private func packet(_ feature: UInt8, _ function: UInt8, _ params: [UInt8]) -> [UInt8] {
        var p: [UInt8] = [Self.longReportID, Self.deviceIndex, feature, (function << 4) | Self.softwareID] + params
        if p.count < 20 { p += [UInt8](repeating: 0, count: 20 - p.count) }
        return Array(p.prefix(20))
    }

    private func request(_ feature: UInt8, _ function: UInt8, _ params: [UInt8],
                         completion: ((Result<[UInt8], HidppError>) -> Void)? = nil) {
        queue.append(Request(feature: feature, function: function, params: params, completion: completion))
        pump()
    }

    private func pump() {
        guard inFlight == nil, !queue.isEmpty else { return }
        guard let dev = device else { failAll(.notConnected); return }
        let req = queue.removeFirst()
        inFlight = req
        let pkt = packet(req.feature, req.function, req.params)
        let r = IOHIDDeviceSetReport(dev, kIOHIDReportTypeOutput, CFIndex(Self.longReportID), pkt, pkt.count)
        if r != kIOReturnSuccess {
            finish(.failure(.writeFailed(r)))
            return
        }
        let work = DispatchWorkItem { [weak self] in self?.finish(.failure(.timeout)) }
        timeoutWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0, execute: work)
    }

    private func finish(_ result: Result<[UInt8], HidppError>) {
        timeoutWork?.cancel()
        timeoutWork = nil
        guard let req = inFlight else { return }
        inFlight = nil
        req.completion?(result)
        pump()
    }

    private func failAll(_ e: HidppError) {
        timeoutWork?.cancel()
        timeoutWork = nil
        let pending = (inFlight.map { [$0] } ?? []) + queue
        inFlight = nil
        queue.removeAll()
        pending.forEach { $0.completion?(.failure(e)) }
    }
}
