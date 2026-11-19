import AppKit
import ApplicationServices
import IOKit.hid
import ServiceManagement

/// App ativo (para perfis por aplicativo).
final class AppWatcher {
    private(set) var frontmostBundleID: String? = NSWorkspace.shared.frontmostApplication?.bundleIdentifier
    var onChange: ((String?) -> Void)?

    init() {
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
        ) { [weak self] n in
            let app = n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            self?.frontmostBundleID = app?.bundleIdentifier
            self?.onChange?(app?.bundleIdentifier)
        }
    }
}

enum Permissions {
    /// Necessária para abrir o mouse via IOHID.
    static var inputMonitoring: Bool { IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) == kIOHIDAccessTypeGranted }
    /// Necessária para enviar atalhos / cliques sintéticos.
    static var accessibility: Bool { AXIsProcessTrusted() }

    static func requestInputMonitoring() { _ = IOHIDRequestAccess(kIOHIDRequestTypeListenEvent) }

    static func requestAccessibility() {
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        _ = AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
    }

    static func openSettings(_ kind: String) {
        let anchor = kind == "accessibility" ? "Privacy_Accessibility" : "Privacy_ListenEvent"
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(anchor)") {
            NSWorkspace.shared.open(url)
        }
    }
}

enum LoginItem {
    static var isEnabled: Bool { SMAppService.mainApp.status == .enabled }

    static func set(_ enabled: Bool) {
        do {
            if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            Log.info("Iniciar com o macOS: \(enabled)")
        } catch {
            Log.error("Falha ao alterar item de login: \(error.localizedDescription)")
        }
    }
}
