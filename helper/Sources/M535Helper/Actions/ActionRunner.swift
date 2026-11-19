import AppKit
import ApplicationServices
import CoreGraphics

/// Runs actions: keyboard shortcuts, system actions, opening apps/URLs and shell commands.
/// Synthetic events require the Accessibility permission.
final class ActionRunner {
    private let source = CGEventSource(stateID: .hidSystemState)
    private var warnedAX = false

    /// Supported system actions (also used by the UI).
    static let systemActions: [String] = [
        "missionControl", "appExpose", "showDesktop", "launchpad",
        "spaceLeft", "spaceRight", "back", "forward",
        "middleClick", "spotlight", "screenshot", "lockScreen",
        "playPause", "nextTrack", "previousTrack", "volumeUp", "volumeDown", "mute",
        "nextTab", "previousTab", "closeWindow", "fullscreen", "zoomIn", "zoomOut",
    ]

    func run(_ a: Action) {
        switch a.type {
        case "none", "default": return
        case "system": runSystem(a.action ?? "")
        case "keystroke":
            guard let k = a.keyCode else { Log.warn("keystroke without keyCode"); return }
            key(CGKeyCode(k), Self.flags(a.modifiers ?? []))
        case "openApp": openApp(a)
        case "openURL": openURL(a.url)
        case "shell": shell(a.command)
        default: Log.warn("Unknown action type: \(a.type)")
        }
    }

    // MARK: System

    private func runSystem(_ name: String) {
        switch name {
        case "missionControl":
            if !dock("com.apple.expose.awake") { openAppAt("/System/Applications/Mission Control.app") }
        case "appExpose":
            if !dock("com.apple.expose.front.awake") { key(125, .maskControl) }
        case "showDesktop":
            if !dock("com.apple.showdesktop.awake") { key(103, .maskSecondaryFn) }
        case "launchpad":
            if !dock("com.apple.launchpad.toggle") { openAppAt("/System/Applications/Launchpad.app") }
        case "spaceLeft": key(123, .maskControl)
        case "spaceRight": key(124, .maskControl)
        case "back": key(33, .maskCommand)              // ⌘[
        case "forward": key(30, .maskCommand)           // ⌘]
        case "middleClick": middle(down: true); middle(down: false)
        case "spotlight": key(49, .maskCommand)         // ⌘Space
        case "screenshot": key(23, [.maskShift, .maskCommand])  // ⇧⌘5
        case "lockScreen": key(12, [.maskControl, .maskCommand])  // ⌃⌘Q
        case "nextTab": key(48, .maskControl)           // ⌃⇥
        case "previousTab": key(48, [.maskControl, .maskShift])
        case "closeWindow": key(13, .maskCommand)       // ⌘W
        case "fullscreen": key(3, [.maskControl, .maskCommand])  // ⌃⌘F
        case "zoomIn": key(24, .maskCommand)            // ⌘=
        case "zoomOut": key(27, .maskCommand)           // ⌘-
        case "playPause": media(16)
        case "nextTrack": media(17)
        case "previousTrack": media(18)
        case "volumeUp": media(0)
        case "volumeDown": media(1)
        case "mute": media(7)
        default: Log.warn("Unknown system action: \(name)")
        }
    }

    private typealias CoreDockSendNotificationFn = @convention(c) (CFString, Int32) -> Void
    private lazy var coreDockSend: CoreDockSendNotificationFn? = {
        // RTLD_DEFAULT == (void*)-2 on macOS. Private Dock API (used by Mac Mouse Fix and similar tools).
        guard let sym = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CoreDockSendNotification") else {
            Log.warn("CoreDockSendNotification unavailable; using fallbacks")
            return nil
        }
        return unsafeBitCast(sym, to: CoreDockSendNotificationFn.self)
    }()

    private func dock(_ notification: String) -> Bool {
        guard let f = coreDockSend else { return false }
        f(notification as CFString, 0)
        return true
    }

    // MARK: Synthetic events

    static func flags(_ mods: [String]) -> CGEventFlags {
        var f = CGEventFlags()
        for m in mods {
            switch m.lowercased() {
            case "cmd", "command": f.insert(.maskCommand)
            case "shift": f.insert(.maskShift)
            case "ctrl", "control": f.insert(.maskControl)
            case "option", "opt", "alt": f.insert(.maskAlternate)
            case "fn": f.insert(.maskSecondaryFn)
            default: break
            }
        }
        return f
    }

    private func checkAX() {
        if !warnedAX && !AXIsProcessTrusted() {
            warnedAX = true
            Log.warn("No Accessibility permission: synthetic shortcuts and clicks will be ignored by the system")
        }
    }

    func key(_ code: CGKeyCode, _ flags: CGEventFlags) {
        checkAX()
        var f = flags
        if (123...126).contains(code) { f.formUnion([.maskSecondaryFn, .maskNumericPad]) }  // arrows
        for down in [true, false] {
            guard let e = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down) else { continue }
            e.flags = f
            e.post(tap: .cghidEventTap)
        }
    }

    func middle(down: Bool) {
        checkAX()
        let loc = CGEvent(source: nil)?.location ?? .zero
        CGEvent(mouseEventSource: source, mouseType: down ? .otherMouseDown : .otherMouseUp,
                mouseCursorPosition: loc, mouseButton: .center)?.post(tap: .cghidEventTap)
    }

    private func media(_ key: Int) {
        checkAX()
        for down in [true, false] {
            let state = down ? 0xA : 0xB
            let ev = NSEvent.otherEvent(with: .systemDefined, location: .zero,
                                        modifierFlags: NSEvent.ModifierFlags(rawValue: UInt(state << 8)),
                                        timestamp: 0, windowNumber: 0, context: nil, subtype: 8,
                                        data1: (key << 16) | (state << 8), data2: -1)
            ev?.cgEvent?.post(tap: .cghidEventTap)
        }
    }

    // MARK: Apps, URLs, shell

    private func openApp(_ a: Action) {
        var url: URL?
        if let b = a.bundleId { url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: b) }
        if url == nil, let p = a.path { url = URL(fileURLWithPath: (p as NSString).expandingTildeInPath) }
        guard let appURL = url else {
            Log.warn("App not found: \(a.bundleId ?? a.path ?? "?")")
            return
        }
        // toggle: if the app is already frontmost, hide it (like a "show/hide" shortcut).
        if a.toggle == true, let front = NSWorkspace.shared.frontmostApplication,
           front.bundleURL?.standardizedFileURL == appURL.standardizedFileURL || (a.bundleId != nil && front.bundleIdentifier == a.bundleId) {
            front.hide()
            return
        }
        openAppAt(appURL.path)
    }

    private func openAppAt(_ path: String) {
        let cfg = NSWorkspace.OpenConfiguration()
        cfg.activates = true
        NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: path), configuration: cfg) { _, err in
            if let err { DispatchQueue.main.async { Log.error("Failed to open \(path): \(err.localizedDescription)") } }
        }
    }

    private func openURL(_ s: String?) {
        guard let s, !s.isEmpty else { return }
        let url: URL?
        if s.hasPrefix("/") || s.hasPrefix("~") {
            url = URL(fileURLWithPath: (s as NSString).expandingTildeInPath)
        } else {
            url = URL(string: s)
        }
        guard let url else { Log.warn("Invalid URL: \(s)"); return }
        NSWorkspace.shared.open(url)
    }

    private func shell(_ cmd: String?) {
        guard let cmd, !cmd.isEmpty else { return }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/zsh")
        p.arguments = ["-lc", cmd]
        p.standardInput = FileHandle.nullDevice
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        do { try p.run() } catch { Log.error("Failed to run command: \(error)") }
    }
}
