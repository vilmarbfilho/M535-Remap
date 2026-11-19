import Foundation

/// Logical controls that can be assigned an action.
enum Control: String, CaseIterable {
    case gestureClick, gestureUp, gestureDown, gestureLeft, gestureRight
    case tiltLeft, tiltRight
    case middleClick
}

/// A configurable action. "Flattened" JSON format to match the frontend's (TS) discriminated union.
///
///   {"type":"none"}
///   {"type":"default"}                                          // native behavior (wheel click only)
///   {"type":"system","action":"missionControl"}
///   {"type":"keystroke","keyCode":8,"modifiers":["cmd"],"keyLabel":"C"}
///   {"type":"openApp","bundleId":"com.apple.Terminal","name":"Terminal","toggle":true}
///   {"type":"openURL","url":"https://example.com"}              // also accepts file/folder paths
///   {"type":"shell","command":"say hello"}
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
    /// Minimum displacement (raw sensor units) for a click to become a gesture.
    var gestureThreshold = 50
    /// Repeats the action while the wheel stays tilted. 0 = no repeat.
    var tiltRepeatIntervalMs = 0
    var tiltRepeatDelayMs = 400
    /// UI language chosen in the settings app ("en", "pt-BR"). nil = follow the system language.
    var language: String? = nil
}

struct Profile: Codable, Equatable {
    var id: String
    var name: String
    /// Bundle IDs of the apps in which this profile is active. Empty for the "default" profile.
    var apps: [String] = []
    /// Key = Control.rawValue. Missing controls inherit from the "default" profile.
    var bindings: [String: Action] = [:]
}

struct Config: Codable, Equatable {
    var version = 1
    var settings = Settings()
    var profiles: [Profile] = []
}

// Lenient decoding: missing keys take the default (decoders in extensions keep the memberwise inits).
extension Settings {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = Settings()
        enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled) ?? d.enabled
        gestureThreshold = try c.decodeIfPresent(Int.self, forKey: .gestureThreshold) ?? d.gestureThreshold
        tiltRepeatIntervalMs = try c.decodeIfPresent(Int.self, forKey: .tiltRepeatIntervalMs) ?? d.tiltRepeatIntervalMs
        tiltRepeatDelayMs = try c.decodeIfPresent(Int.self, forKey: .tiltRepeatDelayMs) ?? d.tiltRepeatDelayMs
        language = try c.decodeIfPresent(String.self, forKey: .language)
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
        c.profiles = [Profile(id: "default", name: Strings.forLanguage(nil).defaultProfileName, apps: [], bindings: bindings)]
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

    /// The wheel click is only diverted if some profile remaps it; otherwise it stays 100% native.
    var needsMiddleDivert: Bool {
        profiles.contains { ($0.bindings[Control.middleClick.rawValue]?.type ?? "default") != "default" }
    }
}
