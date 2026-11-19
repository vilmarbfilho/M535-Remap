// JSON-lines client for the Swift helper's Unix socket, with automatic reconnection.
import net from "node:net";
import { EventEmitter } from "node:events";
import type { Messages } from "../src/shared/i18n";

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

export class HelperClient extends EventEmitter {
  connected = false;
  lastStatus: unknown = null;
  private sock?: net.Socket;
  private buf = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private stopped = false;

  /** `messages` returns the current UI language's strings (used for error messages). */
  constructor(private readonly socketPath: string, private readonly messages: () => Messages["main"]) {
    super();
  }

  start() {
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.sock?.destroy();
  }

  /** Tries to reconnect right away (e.g. right after starting the helper). */
  poke() {
    if (!this.connected && !this.sock) this.connect();
  }

  private connect() {
    if (this.stopped || this.sock) return;
    const s = net.createConnection(this.socketPath);
    this.sock = s;
    s.setEncoding("utf8");
    s.on("connect", () => {
      this.connected = true;
      this.buf = "";
      this.emit("connection", true);
      this.call("status")
        .then((st) => {
          this.lastStatus = st;
          this.emit("event", { event: "status", data: st });
        })
        .catch(() => {});
    });
    s.on("data", (d: string) => this.onData(d));
    s.on("error", () => {});
    s.on("close", () => {
      this.sock = undefined;
      const was = this.connected;
      this.connected = false;
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(this.messages().helperDisconnected));
      }
      this.pending.clear();
      if (was) this.emit("connection", false);
      if (!this.stopped) setTimeout(() => this.connect(), 1500);
    });
  }

  private onData(chunk: string) {
    this.buf += chunk;
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (!line.trim()) continue;
      let msg: { id?: number; result?: unknown; error?: string; event?: string; data?: unknown };
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof msg.id === "number" && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error));
        else p.resolve(msg.result);
      } else if (msg.event) {
        if (msg.event === "status") this.lastStatus = msg.data;
        this.emit("event", { event: msg.event, data: msg.data });
      }
    }
  }

  call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const s = this.sock;
    if (!s || !this.connected) return Promise.reject(new Error(this.messages().helperOffline));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(this.messages().timeout(method)));
      }, 4000);
      this.pending.set(id, { resolve, reject, timer });
      s.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
}
