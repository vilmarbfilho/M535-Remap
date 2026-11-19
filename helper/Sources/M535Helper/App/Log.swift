import Foundation

/// Log simples em ~/Library/Logs/M535Remap/helper.log (rotaciona ao passar de 1 MB).
enum Log {
    static var echoToStdout = false

    static let directory = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Logs/M535Remap", isDirectory: true)
    static let fileURL = directory.appendingPathComponent("helper.log")

    private static var handle: FileHandle? = {
        let fm = FileManager.default
        try? fm.createDirectory(at: directory, withIntermediateDirectories: true)
        if let size = (try? fm.attributesOfItem(atPath: fileURL.path))?[.size] as? Int, size > 1_000_000 {
            try? fm.removeItem(at: fileURL)
        }
        if !fm.fileExists(atPath: fileURL.path) { fm.createFile(atPath: fileURL.path, contents: nil) }
        let h = try? FileHandle(forWritingTo: fileURL)
        h?.seekToEndOfFile()
        return h
    }()

    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
        return f
    }()

    static func info(_ m: String) { write("INFO", m) }
    static func warn(_ m: String) { write("WARN", m) }
    static func error(_ m: String) { write("ERROR", m) }
    static func debug(_ m: String) { if echoToStdout { write("DEBUG", m) } }

    private static func write(_ level: String, _ m: String) {
        let line = "\(formatter.string(from: Date())) [\(level)] \(m)\n"
        guard let data = line.data(using: .utf8) else { return }
        if echoToStdout { FileHandle.standardOutput.write(data) }
        handle?.write(data)
    }
}

enum Paths {
    static let support = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/M535Remap", isDirectory: true)
    static let config = support.appendingPathComponent("config.json")
    static let socket = support.appendingPathComponent("helper.sock")

    static func ensure() {
        try? FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
    }
}
