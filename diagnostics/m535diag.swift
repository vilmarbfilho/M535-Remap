// m535diag — diagnóstico do Logitech M535 no macOS
//
// Compilar:  swiftc -O diagnostics/m535diag.swift -o diagnostics/m535diag
// Uso:
//   ./m535diag perms            -> estado das permissões (Input Monitoring / Accessibility)
//   ./m535diag monitor [--moves]-> HID raw reports do M535 + CGEventTap (listen-only), lado a lado
//   ./m535diag hidpp            -> sonda HID++ 2.0: versão, features e controles reprogramáveis
//   ./m535diag divert [cid]     -> desvia temporariamente um controle (padrão: botão de gestos)
//                                  via HID++ com raw XY e imprime a direção do gesto. Ctrl+C restaura.

import AppKit
import ApplicationServices
import CoreGraphics
import Foundation
import IOKit
import IOKit.hid

let VID = 0x046D
let PID = 0xB016
let SWID: UInt8 = 0x0A
let DEV_IDX: UInt8 = 0xFF  // Bluetooth direto (sem receiver)
let t0 = Date()

func ts() -> String { String(format: "%8.3f", Date().timeIntervalSince(t0)) }
func hex(_ b: [UInt8]) -> String { b.map { String(format: "%02X", $0) }.joined(separator: " ") }
func log(_ src: String, _ msg: String) {
    print("\(ts())  [\(src.padding(toLength: 5, withPad: " ", startingAt: 0))] \(msg)")
    fflush(stdout)
}

// MARK: - Estado global (callbacks C não capturam contexto)

var manager: IOHIDManager!
var devices: [IOHIDDevice] = []
var rawLogging = true
var showMoves = false
var lastButtons: UInt8 = 0
var moveCount = 0
var expect: (feat: UInt8, fn: UInt8)? = nil
var hidppResponse: [UInt8]? = nil
var reprogFeatIdx: UInt8 = 0xFE
var gestureActive = false
var gdx = 0, gdy = 0
var eventTap: CFMachPort?
var quietErrors = false
let debugIO = ProcessInfo.processInfo.environment["M535_DEBUG"] != nil

let cidNames: [UInt16: String] = [
    0x0050: "Left Click", 0x0051: "Right Click", 0x0052: "Middle Click",
    0x0053: "Back", 0x0056: "Forward", 0x005B: "Tilt Left", 0x005D: "Tilt Right",
    0x00C3: "Gesture Button", 0x00C4: "Smart Shift", 0x00D7: "Virtual Gesture",
]
let featureNames: [UInt16: String] = [
    0x0000: "Root", 0x0001: "FeatureSet", 0x0003: "DeviceFwVersion", 0x0005: "DeviceName",
    0x0020: "ConfigChange", 0x1000: "BatteryStatus", 0x1001: "BatteryVoltage",
    0x1814: "ChangeHost", 0x1B00: "ReprogControls", 0x1B01: "ReprogControlsV2",
    0x1B02: "ReprogControlsV2.2", 0x1B03: "ReprogControlsV3", 0x1B04: "ReprogControlsV4",
    0x1D4B: "WirelessDeviceStatus", 0x1DF3: "EquadDJ", 0x1E00: "EnableHidden",
    0x2100: "VerticalScrolling", 0x2110: "SmartShift", 0x2120: "HiResScrolling",
    0x2121: "HiResWheel", 0x2130: "LowResWheel", 0x2200: "MousePointer", 0x2201: "AdjustableDPI",
    0x2205: "PointerSpeed", 0x2230: "AngleSnapping", 0x2250: "AnalysisMode",
    0x40A0: "FnInversion", 0x40A2: "FnInversionWithDefault", 0x1F20: "ADCMeasurement",
    0x00C2: "DFUControlSigned", 0x00D0: "DFU", 0x1802: "DeviceReset", 0x1803: "GPIOAccess",
    0x1805: "OOBState", 0x1830: "PowerModes", 0x1890: "RFTest", 0x18A1: "LEDSoftwareControl",
]

// MARK: - Decodificação dos reports

func signExtend12(_ v: Int) -> Int { v & 0x800 != 0 ? v - 0x1000 : v }

func handleReport(_ b: [UInt8]) {
    guard let id = b.first else { return }

    if id == 0x10 || id == 0x11 {
        if b.count >= 5, let e = expect {
            let fnByte = (e.fn << 4) | SWID
            if b[2] == e.feat && b[3] == fnByte { hidppResponse = b; expect = nil; return }
            if (b[2] == 0xFF || b[2] == 0x8F) && b[3] == e.feat && b[4] == fnByte {
                hidppResponse = b; expect = nil; return
            }
        }
        if b.count >= 4 && b[2] == reprogFeatIdx && (b[3] & 0x0F) == 0 { handleDiverted(b); return }
        if rawLogging || debugIO { log("HID++", "(não solicitado) " + hex(b)) }
        return
    }
    guard rawLogging else { return }

    switch id {
    case 0x02 where b.count >= 7:
        let btn = b[1]
        let x = signExtend12(Int(b[2]) | (Int(b[3] & 0x0F) << 8))
        let y = signExtend12((Int(b[3]) >> 4) | (Int(b[4]) << 4))
        let wheel = Int8(bitPattern: b[5])
        let pan = Int8(bitPattern: b[6])
        if btn == lastButtons && wheel == 0 && pan == 0 {
            moveCount += 1
            if showMoves { log("HID", "move dx=\(x) dy=\(y)") }
            return
        }
        var parts: [String] = []
        if btn != lastButtons {
            let names = ["Left", "Right", "Middle", "B4", "B5", "B6", "B7", "B8"]
            for i in 0..<8 {
                let was = lastButtons & (1 << i) != 0, isNow = btn & (1 << i) != 0
                if was != isNow { parts.append("\(names[i]) \(isNow ? "DOWN" : "UP")") }
            }
            lastButtons = btn
        }
        if wheel != 0 { parts.append("wheel=\(wheel)") }
        if pan != 0 { parts.append("AC-Pan(tilt)=\(pan)") }
        log("HID", "mouse  \(parts.joined(separator: ", "))   raw: \(hex(b))")
    case 0x04 where b.count >= 3:
        let mods = b[1]
        var m: [String] = []
        let modNames = ["LCtrl", "LShift", "LAlt", "LCmd", "RCtrl", "RShift", "RAlt", "RCmd"]
        for i in 0..<8 where mods & (1 << i) != 0 { m.append(modNames[i]) }
        let keys = b.dropFirst(3).filter { $0 != 0 }.map { String(format: "0x%02X", $0) }
        log("HID", "keyboard mods=[\(m.joined(separator: "+"))] keys=\(keys)   raw: \(hex(b))")
    case 0x05 where b.count >= 2:
        var s: [String] = []
        if b[1] & 0x01 != 0 { s.append("AC Forward") }
        if b[1] & 0x02 != 0 { s.append("AC Back") }
        log("HID", "consumer [\(s.isEmpty ? "released" : s.joined(separator: ","))]   raw: \(hex(b))")
    case 0x03 where b.count >= 2:
        log("HID", "battery strength=\(b[1])%")
    default:
        log("HID", "report 0x\(String(format: "%02X", id)): \(hex(b))")
    }
}

func handleDiverted(_ b: [UInt8]) {
    let fn = b[3] >> 4
    let p = Array(b.dropFirst(4))
    if fn == 0 {  // divertedButtonsEvent
        var cids: [UInt16] = []
        for i in stride(from: 0, to: min(8, p.count), by: 2) {
            let c = UInt16(p[i]) << 8 | UInt16(p[i + 1])
            if c != 0 { cids.append(c) }
        }
        if !cids.isEmpty && !gestureActive {
            gestureActive = true; gdx = 0; gdy = 0
            log("DIV", "PRESS \(cids.map { cidNames[$0] ?? String(format: "0x%04X", $0) })")
        } else if cids.isEmpty && gestureActive {
            gestureActive = false
            let dist = max(abs(gdx), abs(gdy))
            let dir: String
            if dist < 30 { dir = "CLIQUE (sem movimento)" }
            else if abs(gdx) > abs(gdy) { dir = gdx > 0 ? "→ DIREITA" : "← ESQUERDA" }
            else { dir = gdy > 0 ? "↓ BAIXO" : "↑ CIMA" }
            log("DIV", "RELEASE  total dx=\(gdx) dy=\(gdy)  =>  \(dir)")
        }
    } else if fn == 1 && p.count >= 4 {  // divertedRawMouseXYEvent
        let dx = Int(Int16(bitPattern: UInt16(p[0]) << 8 | UInt16(p[1])))
        let dy = Int(Int16(bitPattern: UInt16(p[2]) << 8 | UInt16(p[3])))
        gdx += dx; gdy += dy
        if showMoves { log("DIV", "rawXY dx=\(dx) dy=\(dy)") }
    } else {
        log("DIV", "fn=\(fn) \(hex(b))")
    }
}

let reportCallback: IOHIDReportCallback = { _, _, _, _, _, report, len in
    handleReport(Array(UnsafeBufferPointer(start: report, count: len)))
}

// MARK: - IOHID

func openM535() -> Bool {
    manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
    IOHIDManagerSetDeviceMatching(manager, [kIOHIDVendorIDKey: VID, kIOHIDProductIDKey: PID] as CFDictionary)
    IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetCurrent(), CFRunLoopMode.defaultMode.rawValue)
    let r = IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))
    if r != kIOReturnSuccess {
        print("✗ IOHIDManagerOpen falhou (0x\(String(UInt32(bitPattern: r), radix: 16))). Falta permissão de Input Monitoring?")
        return false
    }
    guard let set = IOHIDManagerCopyDevices(manager) as? Set<IOHIDDevice>, !set.isEmpty else {
        print("✗ M535 (046D:B016) não encontrado. Está ligado e conectado?")
        return false
    }
    devices = Array(set)
    for d in devices {
        let name = IOHIDDeviceGetProperty(d, kIOHIDProductKey as CFString) as? String ?? "?"
        let buf = UnsafeMutablePointer<UInt8>.allocate(capacity: 64)
        IOHIDDeviceRegisterInputReportCallback(d, buf, 64, reportCallback, nil)
        print("✓ Aberto: \(name)")
    }
    return true
}

func runFor(_ seconds: Double, until done: () -> Bool) {
    let end = Date().addingTimeInterval(seconds)
    while !done() && Date() < end { CFRunLoopRunInMode(.defaultMode, 0.02, true) }
}

/// Envia um request HID++ 2.0 e aguarda a resposta. Retorna os parâmetros (bytes após o fn/swid).
func hidpp(_ feat: UInt8, _ fn: UInt8, _ params: [UInt8] = []) -> [UInt8]? {
    guard let dev = devices.first else { return nil }
    for long in [true, false] {
        let rid: UInt8 = long ? 0x11 : 0x10
        var pkt: [UInt8] = [rid, DEV_IDX, feat, (fn << 4) | SWID] + params
        pkt += [UInt8](repeating: 0, count: (long ? 20 : 7) - pkt.count)
        hidppResponse = nil
        expect = (feat, fn)
        if debugIO { print("   TX \(hex(pkt))") }
        let r = IOHIDDeviceSetReport(dev, kIOHIDReportTypeOutput, CFIndex(rid), pkt, pkt.count)
        if r != kIOReturnSuccess { continue }
        runFor(1.0) { hidppResponse != nil }
        expect = nil
        if let resp = hidppResponse {
            if debugIO { print("   RX \(hex(resp))") }
            if resp[2] == 0xFF || resp[2] == 0x8F {
                if !quietErrors { print("   (erro HID++ código 0x\(String(format: "%02X", resp.count > 5 ? resp[5] : 0)))") }
                return nil
            }
            return Array(resp.dropFirst(4))
        }
    }
    return nil
}

func featureIndex(_ id: UInt16) -> UInt8? {
    guard let r = hidpp(0x00, 0, [UInt8(id >> 8), UInt8(id & 0xFF)]), r[0] != 0 || id == 0 else { return nil }
    return r[0]
}

// MARK: - Comandos

func cmdPerms() {
    let im = IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)
    let imStr = im == kIOHIDAccessTypeGranted ? "✓ concedida" : im == kIOHIDAccessTypeDenied ? "✗ negada" : "? não decidida"
    print("Input Monitoring (IOHID / listen):  \(imStr)")
    print("CGPreflightListenEventAccess:        \(CGPreflightListenEventAccess() ? "✓" : "✗")")
    print("Accessibility (AXIsProcessTrusted):  \(AXIsProcessTrusted() ? "✓ concedida" : "✗ não concedida")")
    print("CGPreflightPostEventAccess:          \(CGPreflightPostEventAccess() ? "✓" : "✗")")
    if im != kIOHIDAccessTypeGranted {
        print("\n→ Solicitando Input Monitoring (deve aparecer um diálogo do sistema)…")
        _ = IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)
    }
    if !AXIsProcessTrusted() {
        print("→ Solicitando Accessibility…")
        _ = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true] as CFDictionary)
    }
    print("\nAs permissões valem para o app que executa este binário (Terminal, iTerm, VS Code…).")
    print("Ajustes do Sistema → Privacidade e Segurança → Monitoramento de Entrada / Acessibilidade.")
}

func cmdHidpp() {
    guard openM535() else { exit(1) }
    print("\n== Ping (Root fn1) ==")
    guard let ping = hidpp(0x00, 1, [0, 0, 0x5A]) else {
        print("✗ Sem resposta HID++. O dispositivo pode não aceitar HID++ por este caminho.")
        exit(2)
    }
    print("Protocolo HID++ \(ping[0]).\(ping[1])")

    print("\n== Features ==")
    var reprogId: UInt16 = 0
    if let fs = featureIndex(0x0001), let cnt = hidpp(fs, 0)?.first {
        for i in 0...cnt {
            guard let f = hidpp(fs, 1, [i]) else { continue }
            let fid = UInt16(f[0]) << 8 | UInt16(f[1])
            let flags = f[2]
            let tag = (flags & 0x80 != 0 ? " [obsolete]" : "") + (flags & 0x40 != 0 ? " [hidden]" : "") + (flags & 0x20 != 0 ? " [eng]" : "")
            print(String(format: "  idx %2d  0x%04X  v%d  ", i, fid, f.count > 3 ? f[3] : 0) + (featureNames[fid] ?? "?") + tag)
            if (0x1B00...0x1B04).contains(fid) { reprogFeatIdx = i; reprogId = fid }
        }
    } else {
        print("  FeatureSet (0x0001) indisponível")
    }

    guard reprogId != 0 else { print("\n✗ Nenhuma feature ReprogControls encontrada."); return }
    print(String(format: "\n== Controles reprogramáveis (0x%04X, idx %d) ==", reprogId, reprogFeatIdx))
    guard let n = hidpp(reprogFeatIdx, 0)?.first else { return }
    for i in 0..<n {
        guard let c = hidpp(reprogFeatIdx, 1, [i]) else { continue }
        let cid = UInt16(c[0]) << 8 | UInt16(c[1])
        let tid = UInt16(c[2]) << 8 | UInt16(c[3])
        let fl = c[4]
        var caps: [String] = []
        if fl & 0x01 != 0 { caps.append("mouse") }
        if fl & 0x10 != 0 { caps.append("reprog") }
        if fl & 0x20 != 0 { caps.append("divert") }
        if fl & 0x40 != 0 { caps.append("persist") }
        if fl & 0x80 != 0 { caps.append("virtual") }
        if reprogId == 0x1B04 && c.count > 8 && c[8] & 0x01 != 0 { caps.append("rawXY") }
        var rep = ""
        if let g = hidpp(reprogFeatIdx, 2, [c[0], c[1]]), g.count >= 5 {
            let remap = UInt16(g[3]) << 8 | UInt16(g[4])
            rep = String(format: "  reporting=0x%02X remap=0x%04X", g[2], remap)
        }
        print(String(format: "  CID 0x%04X  TID 0x%04X  ", cid, tid) + (cidNames[cid] ?? "?").padding(toLength: 16, withPad: " ", startingAt: 0) + caps.joined(separator: ",").padding(toLength: 30, withPad: " ", startingAt: 0) + rep)
    }
}

func cmdDivert(_ cids: [UInt16], selfTest: Bool) {
    guard openM535() else { exit(1) }
    rawLogging = false
    guard let idx = featureIndex(0x1B04) else {
        print("✗ ReprogControlsV4 (0x1B04) não disponível — divert com raw XY não suportado.")
        exit(2)
    }
    reprogFeatIdx = idx
    var ok: [UInt16] = []
    quietErrors = true  // rawXY só é aceito em 1 controle por vez; os demais caem no divert simples
    for cid in cids {
        // flags: divert(0x01) dvalid(0x02) rawXY(0x10) rvalid(0x20)  — NÃO persistente
        if hidpp(idx, 3, [UInt8(cid >> 8), UInt8(cid & 0xFF), 0x33]) != nil {
            ok.append(cid); print(String(format: "✓ CID 0x%04X desviado com raw XY", cid))
        } else if hidpp(idx, 3, [UInt8(cid >> 8), UInt8(cid & 0xFF), 0x03]) != nil {
            ok.append(cid); print(String(format: "✓ CID 0x%04X desviado (sem raw XY)", cid))
        } else { print(String(format: "✗ CID 0x%04X: setCidReporting falhou", cid)) }
    }
    func restore() {
        rawLogging = false
        for cid in ok {
            let hi = UInt8(cid >> 8), lo = UInt8(cid & 0xFF)
            _ = hidpp(idx, 3, [hi, lo, 0x22])
            if let g = hidpp(idx, 2, [hi, lo]), g.count >= 3 {
                print(String(format: "  CID 0x%04X reporting agora = 0x%02X", cid, g[2]))
            }
        }
        print("✓ Restaurado ao comportamento padrão.")
    }
    if selfTest { restore(); exit(ok.count == cids.count ? 0 : 3) }
    print("\nPressione (e arraste) o botão de gestos, incline a roda ← e →, clique na roda. Ctrl+C restaura.\n")
    rawLogging = true  // mostra também o que ainda chega pelo caminho HID normal

    signal(SIGINT, SIG_IGN)
    let src = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
    src.setEventHandler { print(""); restore(); exit(0) }
    src.resume()
    CFRunLoopRun()
}

/// Lê o reporting de um CID validando o eco do CID na resposta.
func readReporting(_ idx: UInt8, _ cid: UInt16) -> (flags: UInt8, remap: UInt16)? {
    for _ in 0..<3 {
        guard let g = hidpp(idx, 2, [UInt8(cid >> 8), UInt8(cid & 0xFF)]), g.count >= 5 else { continue }
        let echo = UInt16(g[0]) << 8 | UInt16(g[1])
        if echo == cid { return (g[2], UInt16(g[3]) << 8 | UInt16(g[4])) }
        runFor(0.2) { false }  // resposta atrasada de outro request — descarta e tenta de novo
    }
    return nil
}

func cmdReset() {
    guard openM535() else { exit(1) }
    rawLogging = false; quietErrors = true
    guard let idx = featureIndex(0x1B04) else { exit(2) }
    for cid in [UInt16(0x0052), 0x00CE, 0x00CF, 0x00D0] {
        let hi = UInt8(cid >> 8), lo = UInt8(cid & 0xFF)
        let before = readReporting(idx, cid)
        var used = "-"
        for flags: UInt8 in [0x22, 0x20, 0x02] where (readReporting(idx, cid)?.flags ?? 0xFF) != 0 {
            if hidpp(idx, 3, [hi, lo, flags]) != nil { used += String(format: " 0x%02X✓", flags) }
            else { used += String(format: " 0x%02X✗", flags) }
        }
        let after = readReporting(idx, cid)
        print(String(format: "CID 0x%04X  antes=0x%02X  depois=0x%02X  remap=0x%04X  tentativas:%@",
                     cid, before?.flags ?? 0xEE, after?.flags ?? 0xEE, after?.remap ?? 0, used))
    }
}

// MARK: - CGEventTap

func flagStr(_ f: CGEventFlags) -> String {
    var s = ""
    if f.contains(.maskControl) { s += "⌃" }
    if f.contains(.maskAlternate) { s += "⌥" }
    if f.contains(.maskShift) { s += "⇧" }
    if f.contains(.maskCommand) { s += "⌘" }
    if f.contains(.maskSecondaryFn) { s += "fn" }
    return s.isEmpty ? "-" : s
}

let tapCallback: CGEventTapCallBack = { _, type, event, _ in
    switch type {
    case .tapDisabledByTimeout, .tapDisabledByUserInput:
        if let t = eventTap { CGEvent.tapEnable(tap: t, enable: true) }
    case .leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp, .otherMouseDown, .otherMouseUp:
        let n = event.getIntegerValueField(.mouseEventButtonNumber)
        log("TAP", "\(type == .leftMouseDown || type == .rightMouseDown || type == .otherMouseDown ? "mouseDown" : "mouseUp  ") button=\(n)")
    case .scrollWheel:
        let v = event.getIntegerValueField(.scrollWheelEventDeltaAxis1)
        let h = event.getIntegerValueField(.scrollWheelEventDeltaAxis2)
        let cont = event.getIntegerValueField(.scrollWheelEventIsContinuous)
        log("TAP", "scroll  vertical=\(v) horizontal=\(h) continuous=\(cont)")
    case .keyDown, .keyUp:
        let k = event.getIntegerValueField(.keyboardEventKeycode)
        log("TAP", "\(type == .keyDown ? "keyDown" : "keyUp  ") keycode=\(k) flags=\(flagStr(event.flags))")
    case .flagsChanged:
        log("TAP", "flagsChanged \(flagStr(event.flags))")
    default:
        if type.rawValue == 14, let ns = NSEvent(cgEvent: event) {  // NSSystemDefined (teclas de mídia)
            log("TAP", "systemDefined subtype=\(ns.subtype.rawValue) data1=0x\(String(ns.data1, radix: 16))")
        }
    }
    return Unmanaged.passUnretained(event)
}

func startTap() {
    let types: [UInt32] = [1, 2, 3, 4, 10, 11, 12, 14, 22, 25, 26]
    let mask = types.reduce(CGEventMask(0)) { $0 | (1 << CGEventMask($1)) }
    guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
                                      eventsOfInterest: mask, callback: tapCallback, userInfo: nil) else {
        print("✗ Não foi possível criar o CGEventTap (permissão de Input Monitoring?)")
        return
    }
    eventTap = tap
    let src = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
    CFRunLoopAddSource(CFRunLoopGetCurrent(), src, .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
    print("✓ CGEventTap ativo (listen-only, todos os dispositivos — evite usar o trackpad durante o teste)")
}

func cmdMonitor() {
    guard openM535() else { exit(1) }
    startTap()
    print("\nTeste cada controle: clique esq/dir, roda ↑↓, tilt ←→, botão de gestos (clique e segurar+arrastar).")
    print("[HID] = report bruto do M535   [TAP] = evento que o macOS gerou   Ctrl+C para sair\n")
    signal(SIGINT, SIG_IGN)
    let src = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
    src.setEventHandler { print("\n(\(moveCount) reports de movimento puro omitidos)"); exit(0) }
    src.resume()
    CFRunLoopRun()
}

// MARK: - main

let args = Array(CommandLine.arguments.dropFirst())
showMoves = args.contains("--moves")
switch args.first ?? "" {
case "perms": cmdPerms()
case "monitor": cmdMonitor()
case "hidpp": cmdHidpp()
case "reset": cmdReset()
case "divert":
    let given = args.dropFirst().filter { !$0.hasPrefix("--") }.compactMap { UInt16($0.replacingOccurrences(of: "0x", with: ""), radix: 16) }
    cmdDivert(given.isEmpty ? [0x0052, 0x00CE, 0x00CF, 0x00D0] : given, selfTest: args.contains("--selftest"))
default:
    print("uso: m535diag perms | monitor [--moves] | hidpp | divert [cidHex...] [--moves] [--selftest]")
}
