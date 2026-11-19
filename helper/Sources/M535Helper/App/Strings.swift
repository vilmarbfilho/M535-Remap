import Foundation

/// User-facing helper strings (menu bar, tooltip, config errors) in the UI languages.
/// The language comes from `settings.language` in config.json (set by the settings app);
/// when it's missing or unknown, the system's preferred language is used.
struct Strings {
    let connectedTooltip: String
    let disconnectedTooltip: String
    let noDeviceAccess: String
    let connected: String
    let battery: (Int) -> String
    let disconnected: String
    let profile: (String) -> String
    let defaultProfileName: String
    let invalidConfigMenu: String
    let grantInputMonitoring: String
    let grantAccessibility: String
    let restartToApply: String
    let remappingEnabled: String
    let launchAtLogin: String
    let openSettings: String
    let showLog: String
    let restartHelper: String
    let quit: String
    let invalidConfig: (String) -> String

    static let en = Strings(
        connectedTooltip: "M535 Remap — connected",
        disconnectedTooltip: "M535 Remap — mouse disconnected",
        noDeviceAccess: "M535: no access to the device",
        connected: "M535: connected",
        battery: { " · battery \($0)%" },
        disconnected: "M535: disconnected",
        profile: { "Profile: \($0)" },
        defaultProfileName: "Default",
        invalidConfigMenu: "⚠︎ Invalid config.json (see the log)",
        grantInputMonitoring: "⚠︎ Grant Input Monitoring…",
        grantAccessibility: "⚠︎ Grant Accessibility…",
        restartToApply: "Restart to apply permissions",
        remappingEnabled: "Remapping enabled",
        launchAtLogin: "Launch at login",
        openSettings: "Open settings…",
        showLog: "Show log",
        restartHelper: "Restart helper",
        quit: "Quit M535 Remap",
        invalidConfig: { "Invalid config.json — keeping the previous configuration: \($0)" }
    )

    static let ptBR = Strings(
        connectedTooltip: "M535 Remap — conectado",
        disconnectedTooltip: "M535 Remap — mouse desconectado",
        noDeviceAccess: "M535: sem acesso ao dispositivo",
        connected: "M535: conectado",
        battery: { " · bateria \($0)%" },
        disconnected: "M535: desconectado",
        profile: { "Perfil: \($0)" },
        defaultProfileName: "Padrão",
        invalidConfigMenu: "⚠︎ config.json inválido (veja o log)",
        grantInputMonitoring: "⚠︎ Conceder Monitoramento de Entrada…",
        grantAccessibility: "⚠︎ Conceder Acessibilidade…",
        restartToApply: "Reiniciar para aplicar permissões",
        remappingEnabled: "Remapeamento ativo",
        launchAtLogin: "Iniciar com o macOS",
        openSettings: "Abrir configurações…",
        showLog: "Mostrar log",
        restartHelper: "Reiniciar helper",
        quit: "Sair do M535 Remap",
        invalidConfig: { "config.json inválido — mantendo a configuração anterior: \($0)" }
    )

    /// Strings for a language code ("en", "pt-BR"); nil falls back to the system language.
    static func forLanguage(_ code: String?) -> Strings {
        let lang = code ?? Locale.preferredLanguages.first ?? "en"
        return lang.lowercased().hasPrefix("pt") ? ptBR : en
    }
}
