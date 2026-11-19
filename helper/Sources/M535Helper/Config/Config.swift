import Foundation

/// Controles lógicos que podem receber uma ação.
enum Control: String, CaseIterable {
    case gestureClick, gestureUp, gestureDown, gestureLeft, gestureRight
    case tiltLeft, tiltRight
    case middleClick
}

/// Uma ação configurável. Formato JSON "achatado" para casar com a união discriminada do frontend (TS).
///
///   {"type":"none"}
///   {"type":"default"}                                          // comportamento nativo (só clique na roda)
///   {"type":"system","action":"missionControl"}
///   {"type":"keystroke","keyCode":8,"modifiers":["cmd"],"keyLabel":"C"}
///   {"type":"openApp","bundleId":"com.apple.Terminal","name":"Terminal","toggle":true}
///   {"type":"openURL","url":"https://example.com"}              // também aceita caminhos de arquivo/pasta
///   {"type":"shell","command":"say olá"}
struct Action: Codable, Equatable {
    var type: String
    var action: String?
    var keyCode: Int?
    var modifiers: [String]?
    var keyLabel: String?
    var bundleId: String?
    var path: String?
    var name: String?
    var toggle: Bool?
    var url: String?
    var command: String?

    static let none = Action(type: "none")
    static let passthrough = Action(type: "default")
    static func system(_ name: String) -> Action { Action(type: "system", action: name) }

    var summary: String {
        switch type {
        case "system": return "system:\(action ?? "?")"
        case "keystroke":
            let mods = (modifiers ?? []).joined(separator: "+")
            return "keystroke:\(mods.isEmpty ? "" : mods + "+")\(keyLabel ?? String(keyCode ?? -1))"
        case "openApp": return "openApp:\(name ?? bundleId ?? path ?? "?")"
        case "openURL": return "openURL:\(url ?? "")"
        case "shell": return "shell:\(command?.prefix(40) ?? "")"
        default: return type
        }
    }
}

struct Settings: Codable, Equatable {
    var enabled = true
    /// Deslocamento mínimo (unidades raw do sensor) para um clique virar gesto.
    var gestureThreshold = 50
    /// Repetição da ação enquanto o tilt fica inclinado. 0 = sem repetição.
    var tiltRepeatIntervalMs = 0
    var tiltRepeatDelayMs = 400
}

struct Profile: Codable, Equatable {
    var id: String
    var name: String
    /// Bundle IDs dos apps em que este perfil fica ativo. Vazio no perfil "default".
    var apps: [String] = []
    /// Chave = Control.rawValue. Controles ausentes herdam do perfil "default".
    var bindings: [String: Action] = [:]
}

struct Config: Codable, Equatable {
    var version = 1
    var settings = Settings()
    var profiles: [Profile] = []
}

// Decodificação tolerante: chaves ausentes assumem o padrão (decoders em extensões preservam os inits padrão).
extension Settings {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = Settings()
        enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled) ?? d.enabled
        gestureThreshold = try c.decodeIfPresent(Int.self, forKey: .gestureThreshold) ?? d.gestureThreshold
        tiltRepeatIntervalMs = try c.decodeIfPresent(Int.self, forKey: .tiltRepeatIntervalMs) ?? d.tiltRepeatIntervalMs
        tiltRepeatDelayMs = try c.decodeIfPresent(Int.self, forKey: .tiltRepeatDelayMs) ?? d.tiltRepeatDelayMs
    }
}

extension Profile {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? id
        apps = try c.decodeIfPresent([String].self, forKey: .apps) ?? []
        bindings = try c.decodeIfPresent([String: Action].self, forKey: .bindings) ?? [:]
    }
}

extension Config {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = try c.decodeIfPresent(Int.self, forKey: .version) ?? 1
        settings = try c.decodeIfPresent(Settings.self, forKey: .settings) ?? Settings()
        profiles = try c.decodeIfPresent([Profile].self, forKey: .profiles) ?? []
    }

    static let builtInBindings: [Control: Action] = [
        .gestureClick: .system("missionControl"),
        .gestureUp: .system("missionControl"),
        .gestureDown: .system("appExpose"),
        .gestureLeft: .system("spaceLeft"),
        .gestureRight: .system("spaceRight"),
        .tiltLeft: .system("back"),
        .tiltRight: .system("forward"),
        .middleClick: .passthrough,
    ]

    static var defaults: Config {
        var c = Config()
        let bindings = Dictionary(uniqueKeysWithValues: builtInBindings.map { ($0.key.rawValue, $0.value) })
        c.profiles = [Profile(id: "default", name: "Padrão", apps: [], bindings: bindings)]
        return c
    }

    var defaultProfile: Profile? { profiles.first { $0.id == "default" } ?? profiles.first }

    func profile(forApp app: String?) -> Profile? {
        if let app, let p = profiles.first(where: { $0.id != "default" && $0.apps.contains(app) }) { return p }
        return defaultProfile
    }

    func action(for control: Control, app: String?) -> Action {
        if let a = profile(forApp: app)?.bindings[control.rawValue] { return a }
        if let a = defaultProfile?.bindings[control.rawValue] { return a }
        return Config.builtInBindings[control] ?? .none
    }

    /// O clique na roda só é desviado se algum perfil o remapear; senão fica 100% nativo.
    var needsMiddleDivert: Bool {
        profiles.contains { ($0.bindings[Control.middleClick.rawValue]?.type ?? "default") != "default" }
    }
}
