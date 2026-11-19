import Foundation

/// Traduz eventos físicos do M535 (CIDs desviados + movimento bruto) em ações configuradas.
final class RemapEngine {
    private let device: M535Device
    private let runner: ActionRunner
    private let store: ConfigStore
    private let apps: AppWatcher

    /// (controle, fase) → IPC, para a UI destacar o controle ao vivo. Fases: "down", "up", "fire".
    var onEvent: ((String, String) -> Void)?

    private var pressed = Set<UInt16>()
    private var gdx = 0, gdy = 0
    private var tiltTimer: Timer?
    private var middleNativeHeld = false

    init(device: M535Device, runner: ActionRunner, store: ConfigStore, apps: AppWatcher) {
        self.device = device
        self.runner = runner
        self.store = store
        self.apps = apps
        device.onPressed = { [weak self] in self?.pressedChanged($0) }
        device.onMotion = { [weak self] dx, dy in self?.motion(dx, dy) }
        device.onNativeButtons = { [weak self] in self?.nativeButtons($0) }
        device.onNativeWheel = { [weak self] in self?.nativeWheel($0) }
    }

    // MARK: Controles nativos (só repassados à UI para o destaque ao vivo)

    private var nativeState: UInt8 = 0
    private var lastWheelEvent = Date.distantPast

    private func nativeButtons(_ b: UInt8) {
        let names: [(UInt8, String)] = [(0x01, "leftClick"), (0x02, "rightClick"), (0x04, "middle")]
        for (bit, name) in names where (b & bit) != (nativeState & bit) {
            onEvent?(name, b & bit != 0 ? "down" : "up")
        }
        nativeState = b
    }

    private func nativeWheel(_ delta: Int) {
        // Limita a ~30 eventos/s para não inundar o IPC numa rolagem rápida.
        guard Date().timeIntervalSince(lastWheelEvent) > 0.033 else { return }
        lastWheelEvent = Date()
        onEvent?("scroll", delta > 0 ? "scrollUp" : "scrollDown")
    }

    var enabled: Bool { store.config.settings.enabled }

    func refreshDiversion() {
        guard enabled else {
            device.setDesiredDiversion([:])
            return
        }
        var d: [UInt16: UInt8] = [
            CID.gesture: ReportingFlags.divertRawXY,
            CID.tiltLeft: ReportingFlags.divert,
            CID.tiltRight: ReportingFlags.divert,
        ]
        if store.config.needsMiddleDivert { d[CID.middle] = ReportingFlags.divert }
        device.setDesiredDiversion(d)
    }

    private func action(_ c: Control) -> Action { store.config.action(for: c, app: apps.frontmostBundleID) }

    private func fire(_ c: Control) {
        let a = action(c)
        Log.info("\(c.rawValue) → \(a.summary)")
        onEvent?(c.rawValue, "fire")
        runner.run(a)
    }

    // MARK: Eventos do dispositivo

    private func pressedChanged(_ now: Set<UInt16>) {
        let down = now.subtracting(pressed)
        let up = pressed.subtracting(now)
        pressed = now
        down.forEach(handleDown)
        up.forEach(handleUp)
    }

    private func physicalName(_ cid: UInt16) -> String {
        switch cid {
        case CID.gesture: return "gesture"
        case CID.tiltLeft: return "tiltLeft"
        case CID.tiltRight: return "tiltRight"
        case CID.middle: return "middle"
        default: return String(format: "0x%04X", cid)
        }
    }

    private func handleDown(_ cid: UInt16) {
        onEvent?(physicalName(cid), "down")
        switch cid {
        case CID.gesture:
            gdx = 0
            gdy = 0
        case CID.tiltLeft, CID.tiltRight:
            let c: Control = cid == CID.tiltLeft ? .tiltLeft : .tiltRight
            fire(c)
            startTiltRepeat(c)
        case CID.middle:
            if action(.middleClick).type == "default" {
                middleNativeHeld = true
                runner.middle(down: true)
            } else {
                fire(.middleClick)
            }
        default: break
        }
    }

    private func handleUp(_ cid: UInt16) {
        switch cid {
        case CID.gesture:
            let threshold = max(10, store.config.settings.gestureThreshold)
            let c: Control
            if max(abs(gdx), abs(gdy)) < threshold {
                c = .gestureClick
            } else if abs(gdx) > abs(gdy) {
                c = gdx > 0 ? .gestureRight : .gestureLeft
            } else {
                c = gdy > 0 ? .gestureDown : .gestureUp
            }
            Log.debug("gesto dx=\(gdx) dy=\(gdy)")
            fire(c)
        case CID.tiltLeft, CID.tiltRight:
            tiltTimer?.invalidate()
            tiltTimer = nil
        case CID.middle:
            if middleNativeHeld {
                middleNativeHeld = false
                runner.middle(down: false)
            }
        default: break
        }
        onEvent?(physicalName(cid), "up")
    }

    private func motion(_ dx: Int, _ dy: Int) {
        guard pressed.contains(CID.gesture) else { return }
        gdx += dx
        gdy += dy
    }

    private func startTiltRepeat(_ c: Control) {
        tiltTimer?.invalidate()
        tiltTimer = nil
        let s = store.config.settings
        guard s.tiltRepeatIntervalMs > 0 else { return }
        let delay = Timer(timeInterval: Double(max(100, s.tiltRepeatDelayMs)) / 1000, repeats: false) { [weak self] _ in
            guard let self else { return }
            let t = Timer(timeInterval: Double(max(30, s.tiltRepeatIntervalMs)) / 1000, repeats: true) { [weak self] _ in
                self?.runner.run(self?.action(c) ?? .none)
            }
            RunLoop.main.add(t, forMode: .common)
            self.tiltTimer = t
        }
        RunLoop.main.add(delay, forMode: .common)
        tiltTimer = delay
    }
}
