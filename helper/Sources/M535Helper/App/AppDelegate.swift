import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    static let version = "0.1.0"

    private let store = ConfigStore()
    private let device = M535Device()
    private let runner = ActionRunner()
    private let apps = AppWatcher()
    private let ipc = IPCServer(path: Paths.socket.path)
    private lazy var engine = RemapEngine(device: device, runner: runner, store: store, apps: apps)

    private var statusItem: NSStatusItem!
    private var permTimer: Timer?
    private var signalSources: [DispatchSourceSignal] = []
    private var lastPerms: (Bool, Bool)?

    // MARK: Ciclo de vida

    func applicationDidFinishLaunching(_ notification: Notification) {
        Log.info("M535 Remap helper \(Self.version) iniciando (pid \(getpid()))")

        store.onChange = { [weak self] _ in
            self?.engine.refreshDiversion()
            self?.stateChanged()
        }
        store.onError = { [weak self] msg in self?.ipc.broadcast(event: "configError", data: ["message": msg]) }
        store.watch()

        apps.onChange = { [weak self] _ in self?.stateChanged() }
        engine.onEvent = { [weak self] control, phase in
            self?.ipc.broadcast(event: "control", data: ["control": control, "phase": phase])
        }
        device.onStateChange = { [weak self] in self?.stateChanged() }

        setupStatusItem()
        setupSignals()

        ipc.handler = { [weak self] method, params in
            guard let self else { throw IPCError(message: "encerrando") }
            return try self.handleIPC(method, params)
        }
        do { try ipc.start() } catch { Log.error("IPC indisponível: \(error)") }

        engine.refreshDiversion()
        device.start()

        if !Permissions.inputMonitoring { Permissions.requestInputMonitoring() }
        if !Permissions.accessibility { Permissions.requestAccessibility() }

        let t = Timer(timeInterval: 2, repeats: true) { [weak self] _ in self?.pollPermissions() }
        RunLoop.main.add(t, forMode: .common)
        permTimer = t
    }

    func applicationWillTerminate(_ notification: Notification) {
        device.restoreSync()
        ipc.stop()
        Log.info("Helper encerrado")
    }

    private func setupSignals() {
        for sig in [SIGTERM, SIGINT, SIGHUP] {
            signal(sig, SIG_IGN)
            let src = DispatchSource.makeSignalSource(signal: sig, queue: .main)
            src.setEventHandler { NSApp.terminate(nil) }
            src.resume()
            signalSources.append(src)
        }
        signal(SIGPIPE, SIG_IGN)
    }

    private func pollPermissions() {
        let im = Permissions.inputMonitoring, ax = Permissions.accessibility
        if im && !device.managerOpen { device.tryOpen() }
        if lastPerms == nil || lastPerms! != (im, ax) {
            lastPerms = (im, ax)
            stateChanged()
        }
    }

    private func stateChanged() {
        updateIcon()
        ipc.broadcast(event: "status", data: statusDict())
    }

    // MARK: Status / IPC

    private func statusDict() -> [String: Any] {
        let profile = store.config.profile(forApp: apps.frontmostBundleID)
        return [
            "version": Self.version,
            "connected": device.isReady,
            "deviceName": device.productName ?? NSNull(),
            "battery": device.batteryPercent ?? NSNull(),
            "hidOpen": device.managerOpen,
            "inputMonitoring": Permissions.inputMonitoring,
            "accessibility": Permissions.accessibility,
            "enabled": store.config.settings.enabled,
            "activeApp": apps.frontmostBundleID ?? NSNull(),
            "activeProfileId": profile?.id ?? NSNull(),
            "activeProfileName": profile?.name ?? NSNull(),
            "configPath": Paths.config.path,
            "configError": store.lastError ?? NSNull(),
            "launchAtLogin": LoginItem.isEnabled,
            "systemActions": ActionRunner.systemActions,
        ]
    }

    private func handleIPC(_ method: String, _ p: [String: Any]) throws -> Any {
        switch method {
        case "ping":
            return "pong"
        case "status":
            return statusDict()
        case "reloadConfig":
            store.reload()
            return statusDict()
        case "setEnabled":
            guard let on = p["enabled"] as? Bool else { throw IPCError(message: "parâmetro 'enabled' ausente") }
            setEnabled(on)
            return statusDict()
        case "runAction":
            guard let raw = p["action"], JSONSerialization.isValidJSONObject(raw) else { throw IPCError(message: "parâmetro 'action' ausente") }
            let a = try JSONDecoder().decode(Action.self, from: JSONSerialization.data(withJSONObject: raw))
            runner.run(a)
            return true
        case "requestPermission":
            let kind = p["kind"] as? String ?? ""
            if kind == "accessibility" { Permissions.requestAccessibility() } else { Permissions.requestInputMonitoring() }
            Permissions.openSettings(kind)
            return true
        case "setLaunchAtLogin":
            LoginItem.set(p["enabled"] as? Bool ?? true)
            return statusDict()
        default:
            throw IPCError(message: "método desconhecido: \(method)")
        }
    }

    private func setEnabled(_ on: Bool) {
        var c = store.config
        guard c.settings.enabled != on else { return }
        c.settings.enabled = on
        store.save(c)
        engine.refreshDiversion()
        stateChanged()
        Log.info("Remapeamento \(on ? "ativado" : "pausado")")
    }

    // MARK: Barra de menus

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu
        updateIcon()
    }

    private func updateIcon() {
        guard let button = statusItem?.button else { return }
        let missingPerm = !Permissions.inputMonitoring || !Permissions.accessibility
        let symbol: String
        if missingPerm { symbol = "exclamationmark.triangle" }
        else if device.isReady { symbol = "computermouse.fill" }
        else { symbol = "computermouse" }
        let img = NSImage(systemSymbolName: symbol, accessibilityDescription: "M535 Remap")
        img?.isTemplate = true
        button.image = img
        button.appearsDisabled = !store.config.settings.enabled || !device.isReady
        button.toolTip = device.isReady ? "M535 Remap — conectado" : "M535 Remap — mouse desconectado"
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()

        let deviceTitle: String
        if !device.managerOpen { deviceTitle = "M535: sem acesso ao dispositivo" }
        else if device.isReady {
            deviceTitle = "M535: conectado" + (device.batteryPercent.map { " · bateria \($0)%" } ?? "")
        } else { deviceTitle = "M535: desconectado" }
        menu.addItem(disabled(deviceTitle))

        if let p = store.config.profile(forApp: apps.frontmostBundleID) {
            menu.addItem(disabled("Perfil: \(p.name)"))
        }
        if store.lastError != nil { menu.addItem(disabled("⚠︎ config.json inválido (veja o log)")) }

        if !Permissions.inputMonitoring || !Permissions.accessibility {
            menu.addItem(.separator())
            if !Permissions.inputMonitoring {
                menu.addItem(item("⚠︎ Conceder Monitoramento de Entrada…", #selector(grantInputMonitoring)))
            }
            if !Permissions.accessibility {
                menu.addItem(item("⚠︎ Conceder Acessibilidade…", #selector(grantAccessibility)))
            }
            if Permissions.inputMonitoring && !device.managerOpen {
                menu.addItem(item("Reiniciar para aplicar permissões", #selector(relaunch)))
            }
        }

        menu.addItem(.separator())
        let toggle = item("Remapeamento ativo", #selector(toggleEnabled))
        toggle.state = store.config.settings.enabled ? .on : .off
        menu.addItem(toggle)
        let login = item("Iniciar com o macOS", #selector(toggleLogin))
        login.state = LoginItem.isEnabled ? .on : .off
        menu.addItem(login)

        menu.addItem(.separator())
        menu.addItem(item("Abrir configurações…", #selector(openSettings), key: ","))
        menu.addItem(item("Mostrar log", #selector(showLog)))
        menu.addItem(item("Reiniciar helper", #selector(relaunch)))
        menu.addItem(.separator())
        menu.addItem(item("Sair do M535 Remap", #selector(quit), key: "q"))
    }

    private func disabled(_ title: String) -> NSMenuItem {
        let i = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        i.isEnabled = false
        return i
    }

    private func item(_ title: String, _ sel: Selector, key: String = "") -> NSMenuItem {
        let i = NSMenuItem(title: title, action: sel, keyEquivalent: key)
        i.target = self
        return i
    }

    @objc private func grantInputMonitoring() {
        Permissions.requestInputMonitoring()
        Permissions.openSettings("inputMonitoring")
    }

    @objc private func grantAccessibility() {
        Permissions.requestAccessibility()
        Permissions.openSettings("accessibility")
    }

    @objc private func toggleEnabled() { setEnabled(!store.config.settings.enabled) }

    @objc private func toggleLogin() { LoginItem.set(!LoginItem.isEnabled) }

    @objc private func openSettings() {
        // Abre a UI Electron; sem ela instalada, cai para o config.json no TextEdit.
        if let ui = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.m535remap.settings") {
            NSWorkspace.shared.openApplication(at: ui, configuration: NSWorkspace.OpenConfiguration(), completionHandler: nil)
            return
        }
        NSWorkspace.shared.open([Paths.config], withApplicationAt: URL(fileURLWithPath: "/System/Applications/TextEdit.app"),
                                configuration: NSWorkspace.OpenConfiguration(), completionHandler: nil)
    }

    @objc private func showLog() {
        NSWorkspace.shared.open([Log.fileURL], withApplicationAt: URL(fileURLWithPath: "/System/Applications/Utilities/Console.app"),
                                configuration: NSWorkspace.OpenConfiguration(), completionHandler: nil)
    }

    @objc private func relaunch() {
        let path = Bundle.main.bundlePath
        guard path.hasSuffix(".app") else { Log.warn("Reinício só funciona a partir do .app"); return }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/sh")
        p.arguments = ["-c", "sleep 1; /usr/bin/open \"\(path)\""]
        try? p.run()
        NSApp.terminate(nil)
    }

    @objc private func quit() { NSApp.terminate(nil) }
}
