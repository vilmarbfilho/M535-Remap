import Foundation

/// Carrega/salva config.json e recarrega automaticamente quando o arquivo muda (ex.: salvo pela UI Electron).
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
            Log.info("config.json padrão criado em \(Paths.config.path)")
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
            Log.info("Configuração carregada (\(c.profiles.count) perfil(is))")
            if notify { onChange?(c) }
        } catch {
            let msg = "config.json inválido — mantendo a configuração anterior: \(error)"
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
            Log.error("Falha ao salvar config: \(error)")
        }
    }

    /// Observa o diretório (escritas atômicas substituem o arquivo, então observar o fd do arquivo não basta).
    func watch() {
        dirFD = open(Paths.support.path, O_EVTONLY)
        guard dirFD >= 0 else { Log.warn("Não foi possível observar \(Paths.support.path)"); return }
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
