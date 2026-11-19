import AppKit

let args = CommandLine.arguments
Log.echoToStdout = args.contains("--verbose") || isatty(STDOUT_FILENO) != 0

Paths.ensure()
if IPCServer.isAlreadyRunning(path: Paths.socket.path) {
    Log.info("Outra instância do helper já está rodando — saindo")
    exit(0)
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
