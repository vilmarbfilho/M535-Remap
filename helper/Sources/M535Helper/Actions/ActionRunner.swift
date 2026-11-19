import AppKit
import ApplicationServices
import CoreGraphics

/// Executa ações: atalhos de teclado, ações do sistema, abrir apps/URLs e comandos shell.
/// Eventos sintéticos exigem permissão de Acessibilidade.
final class ActionRunner {
    private let source = CGEventSource(stateID: .hidSystemState)
    private var warnedAX = false

    /// Ações de sistema suportadas (usadas também pela UI).
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
            guard let k = a.keyCode else { Log.warn("keystroke sem keyCode"); return }
            key(CGKeyCode(k), Self.flags(a.modifiers ?? []))
        case "openApp": openApp(a)
        case "openURL": openURL(a.url)
        case "shell": shell(a.command)
        default: Log.warn("Tipo de ação desconhecido: \(a.type)")
        }
    }

    // MARK: Sistema

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
        default: Log.warn("Ação de sistema desconhecida: \(name)")
        }
    }

    private typealias CoreDockSendNotificationFn = @convention(c) (CFString, Int32) -> Void
    private lazy var coreDockSend: CoreDockSendNotificationFn? = {
        // RTLD_DEFAULT == (void*)-2 no macOS. API privada do Dock (usada por Mac Mouse Fix e similares).
        guard let sym = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CoreDockSendNotification") else {
            Log.warn("CoreDockSendNotification indisponível; usando alternativas")
            return nil
        }
        return unsafeBitCast(sym, to: CoreDockSendNotificationFn.self)
    }()

    private func dock(_ notification: String) -> Bool {
        guard let f = coreDockSend else { return false }
        f(notification as CFString, 0)
        return true
    }

    // MARK: Eventos sintéticos

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
            Log.warn("Sem permissão de Acessibilidade: atalhos e cliques sintéticos serão ignorados pelo sistema")
        }
    }

    func key(_ code: CGKeyCode, _ flags: CGEventFlags) {
        checkAX()
        var f = flags
        if (123...126).contains(code) { f.formUnion([.maskSecondaryFn, .maskNumericPad]) }  // setas
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
            Log.warn("App não encontrado: \(a.bundleId ?? a.path ?? "?")")
            return
        }
        // toggle: se o app já está na frente, esconde (como um atalho "mostrar/ocultar").
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
            if let err { DispatchQueue.main.async { Log.error("Falha ao abrir \(path): \(err.localizedDescription)") } }
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
        guard let url else { Log.warn("URL inválida: \(s)"); return }
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
        do { try p.run() } catch { Log.error("Falha ao executar comando: \(error)") }
    }
}
