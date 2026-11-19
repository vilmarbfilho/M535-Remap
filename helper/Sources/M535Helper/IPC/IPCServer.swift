import Foundation

struct IPCError: Error { let message: String }

/// Servidor JSON-lines em Unix domain socket (~/Library/Application Support/M535Remap/helper.sock).
///
/// Request:  {"id":1,"method":"status","params":{}}
/// Response: {"id":1,"result":{...}}  ou  {"id":1,"error":"..."}
/// Evento:   {"event":"control","data":{"control":"gestureUp","phase":"fire"}}
final class IPCServer {
    typealias Handler = (_ method: String, _ params: [String: Any]) throws -> Any

    var handler: Handler?
    private let path: String
    private var listenFD: Int32 = -1
    private var listenSource: DispatchSourceRead?
    private var clients: [Int32: Client] = [:]

    private final class Client {
        let fd: Int32
        var source: DispatchSourceRead?
        var buffer = Data()
        init(fd: Int32) { self.fd = fd }
    }

    init(path: String) { self.path = path }

    private static func makeAddress(_ path: String) -> sockaddr_un? {
        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        addr.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
        let bytes = Array(path.utf8)
        guard bytes.count < MemoryLayout.size(ofValue: addr.sun_path) else { return nil }
        withUnsafeMutableBytes(of: &addr.sun_path) { raw in
            raw.copyBytes(from: bytes)
            raw[bytes.count] = 0
        }
        return addr
    }

    /// Outra instância do helper já está escutando neste socket?
    static func isAlreadyRunning(path: String) -> Bool {
        guard var addr = makeAddress(path) else { return false }
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { return false }
        defer { close(fd) }
        let r = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) }
        }
        return r == 0
    }

    func start() throws {
        guard var addr = Self.makeAddress(path) else { throw IPCError(message: "caminho do socket longo demais") }
        unlink(path)
        listenFD = socket(AF_UNIX, SOCK_STREAM, 0)
        guard listenFD >= 0 else { throw IPCError(message: "socket() falhou: \(errno)") }
        let r = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(listenFD, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) }
        }
        guard r == 0 else { throw IPCError(message: "bind() falhou: \(errno)") }
        chmod(path, 0o600)
        guard listen(listenFD, 8) == 0 else { throw IPCError(message: "listen() falhou: \(errno)") }
        _ = fcntl(listenFD, F_SETFL, O_NONBLOCK)
        let src = DispatchSource.makeReadSource(fileDescriptor: listenFD, queue: .main)
        src.setEventHandler { [weak self] in self?.acceptClients() }
        src.resume()
        listenSource = src
        Log.info("IPC escutando em \(path)")
    }

    func stop() {
        clients.values.forEach { $0.source?.cancel() }
        clients.removeAll()
        listenSource?.cancel()
        if listenFD >= 0 { close(listenFD) }
        unlink(path)
    }

    func broadcast(event: String, data: Any) {
        let msg: [String: Any] = ["event": event, "data": data]
        for c in Array(clients.values) { send(msg, to: c) }
    }

    private func acceptClients() {
        while true {
            let fd = accept(listenFD, nil, nil)
            if fd < 0 { break }
            var one: Int32 = 1
            setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size))
            _ = fcntl(fd, F_SETFL, O_NONBLOCK)
            let c = Client(fd: fd)
            let src = DispatchSource.makeReadSource(fileDescriptor: fd, queue: .main)
            src.setEventHandler { [weak self] in self?.readFrom(c) }
            src.setCancelHandler { close(fd) }
            c.source = src
            clients[fd] = c
            src.resume()
        }
    }

    private func readFrom(_ c: Client) {
        var buf = [UInt8](repeating: 0, count: 8192)
        let n = read(c.fd, &buf, buf.count)
        if n <= 0 {
            if n == 0 || errno != EAGAIN { drop(c) }
            return
        }
        c.buffer.append(contentsOf: buf[0..<n])
        while let nl = c.buffer.firstIndex(of: 0x0A) {
            let line = c.buffer.subdata(in: c.buffer.startIndex..<nl)
            c.buffer = c.buffer.subdata(in: (nl + 1)..<c.buffer.endIndex)
            handleLine(line, from: c)
        }
        if c.buffer.count > 1_000_000 { drop(c) }
    }

    private func handleLine(_ data: Data, from c: Client) {
        guard let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let method = obj["method"] as? String else { return }
        var resp: [String: Any] = ["id": obj["id"] ?? NSNull()]
        do {
            resp["result"] = try handler?(method, obj["params"] as? [String: Any] ?? [:]) ?? NSNull()
        } catch let e as IPCError {
            resp["error"] = e.message
        } catch {
            resp["error"] = "\(error)"
        }
        send(resp, to: c)
    }

    private func send(_ obj: [String: Any], to c: Client) {
        guard JSONSerialization.isValidJSONObject(obj),
              var d = try? JSONSerialization.data(withJSONObject: obj) else { return }
        d.append(0x0A)
        let w = d.withUnsafeBytes { write(c.fd, $0.baseAddress, d.count) }
        if w < 0 && errno != EAGAIN { drop(c) }
    }

    private func drop(_ c: Client) {
        guard clients[c.fd] != nil else { return }
        clients[c.fd] = nil
        c.source?.cancel()
    }
}
