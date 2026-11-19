import Foundation

/// Loads/saves config.json and reloads automatically when the file changes (e.g. saved by the Electron UI).
final class ConfigStore {
    private(set) var config: Config = .defaults
    private(set) var lastError: String?
    var onChange: ((Config) -> Void)?
    var onError: ((String) -> Void)?

    private var lastData: Data?
    private var dirFD: Int32 = -1
    private var source: DispatchSourceFileSystemObject?
    private var pending: DispatchWorkItem?

    init() {
        Paths.ensure()
        if FileManager.default.fileExists(atPath: Paths.config.path) {
            reload(notify: false)
        } else {
            save(.defaults)
            Log.info("Default config.json created at \(Paths.config.path)")
        }
    }

    func reload(notify: Bool = true) {
        guard let data = try? Data(contentsOf: Paths.config) else { return }
        guard data != lastData else { return }
        lastData = data
        do {
            let c = try JSONDecoder().decode(Config.self, from: data)
            lastError = nil
            guard c != config || !notify else { return }
            config = c
            Log.info("Configuration loaded (\(c.profiles.count) profile(s))")
            if notify { onChange?(c) }
        } catch {
            // Shown in the UI banner, so it follows the language of the last valid configuration.
            let msg = Strings.forLanguage(config.settings.language).invalidConfig("\(error)")
            lastError = msg
            Log.error(msg)
            onError?(msg)
        }
    }

    func save(_ c: Config) {
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        do {
            let data = try enc.encode(c)
            try data.write(to: Paths.config, options: .atomic)
            lastData = data
            config = c
        } catch {
            Log.error("Failed to save config: \(error)")
        }
    }

    /// Watches the directory (atomic writes replace the file, so watching the file's fd is not enough).
    func watch() {
        dirFD = open(Paths.support.path, O_EVTONLY)
        guard dirFD >= 0 else { Log.warn("Could not watch \(Paths.support.path)"); return }
        let src = DispatchSource.makeFileSystemObjectSource(fileDescriptor: dirFD, eventMask: [.write, .rename, .delete], queue: .main)
        src.setEventHandler { [weak self] in
            self?.pending?.cancel()
            let work = DispatchWorkItem { self?.reload() }
            self?.pending = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2, execute: work)
        }
        src.setCancelHandler { [dirFD] in close(dirFD) }
        src.resume()
        source = src
    }
}
