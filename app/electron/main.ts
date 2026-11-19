import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ConfigSchema, defaultConfig, type Config } from "../src/shared/schema";
import { HelperClient } from "./helperClient";

const execFileP = promisify(execFile);

const SUPPORT_DIR = path.join(os.homedir(), "Library/Application Support/M535Remap");
const CONFIG_PATH = path.join(SUPPORT_DIR, "config.json");
const SOCKET_PATH = path.join(SUPPORT_DIR, "helper.sock");
const LOG_PATH = path.join(os.homedir(), "Library/Logs/M535Remap/helper.log");
const HELPER_BUNDLE_ID = "com.m535remap.helper";
const HELPER_APP_PATH = path.join(os.homedir(), "Applications/M535 Remap Helper.app");

let win: BrowserWindow | null = null;
let recording = false;
let lastWritten = "";
const helper = new HelperClient(SOCKET_PATH);

// MARK: config.json

function readConfig(): { config: Config; error?: string } {
  let raw: string;
  try {
    raw = fs.readFileSync(CONFIG_PATH, "utf8");
  } catch {
    return { config: defaultConfig() };
  }
  try {
    const parsed = ConfigSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { config: parsed.data };
    return { config: defaultConfig(), error: "config.json inválido: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  } catch (e) {
    return { config: defaultConfig(), error: "config.json não é um JSON válido: " + (e as Error).message };
  }
}

function writeConfig(c: unknown): { ok: boolean; error?: string } {
  const parsed = ConfigSchema.safeParse(c);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  const text = JSON.stringify(parsed.data, null, 2) + "\n";
  fs.mkdirSync(SUPPORT_DIR, { recursive: true });
  const tmp = CONFIG_PATH + ".tmp";
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, CONFIG_PATH); // atômico: o helper recarrega ao ver o diretório mudar
  lastWritten = text;
  return { ok: true };
}

/** Avisa a UI quando o config.json muda por fora (ex.: "Remapeamento ativo" no menu do helper). */
function watchConfig() {
  fs.mkdirSync(SUPPORT_DIR, { recursive: true });
  let t: NodeJS.Timeout | undefined;
  fs.watch(SUPPORT_DIR, (_ev, file) => {
    if (file !== "config.json") return;
    clearTimeout(t);
    t = setTimeout(() => {
      let text = "";
      try { text = fs.readFileSync(CONFIG_PATH, "utf8"); } catch { return; }
      if (text === lastWritten) return;
      lastWritten = text;
      win?.webContents.send("config:external", readConfig());
    }, 250);
  });
}

// MARK: apps

interface AppInfo { bundleId?: string; name: string; path: string; icon?: string }
const appCache = new Map<string, AppInfo | null>();

async function appInfoFromPath(appPath: string): Promise<AppInfo | null> {
  if (!appPath.endsWith(".app") || !fs.existsSync(appPath)) return null;
  let plist: Record<string, string> = {};
  try {
    const { stdout } = await execFileP("/usr/bin/plutil", ["-convert", "json", "-o", "-", path.join(appPath, "Contents/Info.plist")]);
    plist = JSON.parse(stdout);
  } catch { /* alguns apps têm plist binário ilegível; seguimos só com o nome */ }
  let icon: string | undefined;
  try { icon = (await app.getFileIcon(appPath, { size: "large" })).toDataURL(); } catch { /* sem ícone */ }
  return {
    bundleId: plist.CFBundleIdentifier,
    name: plist.CFBundleDisplayName || plist.CFBundleName || path.basename(appPath, ".app"),
    path: appPath,
    icon,
  };
}

async function appPathForBundleId(id: string): Promise<string | null> {
  if (!/^[A-Za-z0-9.\-_]+$/.test(id)) return null;
  try {
    const { stdout } = await execFileP("/usr/bin/mdfind", [`kMDItemCFBundleIdentifier == "${id}"`]);
    return stdout.split("\n").find((l) => l.endsWith(".app")) ?? null;
  } catch {
    return null;
  }
}

async function appInfo(idOrPath: string): Promise<AppInfo | null> {
  if (appCache.has(idOrPath)) return appCache.get(idOrPath)!;
  const p = idOrPath.startsWith("/") ? idOrPath : await appPathForBundleId(idOrPath);
  const info = p ? await appInfoFromPath(p) : null;
  appCache.set(idOrPath, info);
  return info;
}

// MARK: helper

async function launchHelper(): Promise<boolean> {
  try {
    await execFileP("/usr/bin/open", ["-b", HELPER_BUNDLE_ID]);
  } catch {
    try { await execFileP("/usr/bin/open", [HELPER_APP_PATH]); } catch { return false; }
  }
  setTimeout(() => helper.poke(), 800);
  return true;
}

const ALLOWED_METHODS = new Set(["status", "setEnabled", "runAction", "requestPermission", "setLaunchAtLogin", "reloadConfig"]);

// MARK: janela

function createWindow() {
  win = new BrowserWindow({
    width: 1160,
    height: 780,
    minWidth: 980,
    minHeight: 660,
    title: "M535 Remap",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: "sidebar",
    visualEffectState: "followWindow",
    backgroundColor: "#00000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, "../dist/index.html"));

  win.once("ready-to-show", () => win?.show());

  // Desenvolvimento: M535_SCREENSHOT=/caminho.png [M535_THEME=dark|light] renderiza a janela num PNG e sai.
  const shot = process.env.M535_SCREENSHOT;
  if (shot) {
    if (process.env.M535_THEME === "dark" || process.env.M535_THEME === "light") nativeTheme.themeSource = process.env.M535_THEME;
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const img = await win!.webContents.capturePage();
        fs.writeFileSync(shot, img.toPNG());
        app.quit();
      }, 2500);
    });
  }
  win.on("closed", () => { win = null; recording = false; });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // Gravação de atalho: intercepta antes dos atalhos de menu (⌘W, ⌘Q…) e do próprio renderer.
  win.webContents.on("before-input-event", (event, input) => {
    if (!recording || input.type !== "keyDown") return;
    event.preventDefault();
    win?.webContents.send("recorder:key", {
      code: input.code, key: input.key, shift: input.shift, control: input.control, alt: input.alt, meta: input.meta,
    });
  });
}

function registerIpc() {
  ipcMain.handle("config:load", () => readConfig());
  ipcMain.handle("config:save", (_e, c: unknown) => writeConfig(c));
  ipcMain.handle("helper:state", () => ({ connected: helper.connected, status: helper.lastStatus }));
  ipcMain.handle("helper:call", async (_e, method: string, params?: Record<string, unknown>) => {
    if (!ALLOWED_METHODS.has(method)) throw new Error("método não permitido");
    return helper.call(method, params ?? {});
  });
  ipcMain.handle("helper:launch", () => launchHelper());
  ipcMain.handle("app:pick", async () => {
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, {
      title: "Escolha um aplicativo",
      defaultPath: "/Applications",
      properties: ["openFile"],
      filters: [{ name: "Aplicativos", extensions: ["app"] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const info = await appInfoFromPath(r.filePaths[0]);
    if (info?.bundleId) appCache.set(info.bundleId, info);
    return info;
  });
  ipcMain.handle("app:info", (_e, idOrPath: string) => appInfo(idOrPath));
  ipcMain.handle("file:pick", async () => {
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, { title: "Escolha um arquivo ou pasta", properties: ["openFile", "openDirectory"] });
    return r.canceled ? null : r.filePaths[0] ?? null;
  });
  ipcMain.handle("recorder:set", (_e, on: boolean) => { recording = !!on; });
  ipcMain.handle("shell:openLog", () => shell.openPath(LOG_PATH));
  ipcMain.handle("shell:openConfigFolder", () => shell.openPath(SUPPORT_DIR));

  helper.on("event", (e) => win?.webContents.send("helper:event", e));
  helper.on("connection", (c: boolean) => win?.webContents.send("helper:connection", c));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(() => {
    try { lastWritten = fs.readFileSync(CONFIG_PATH, "utf8"); } catch { /* ainda não existe */ }
    registerIpc();
    watchConfig();
    helper.start();
    createWindow();
    app.on("activate", () => { if (!win) createWindow(); });
  });
  app.on("window-all-closed", () => app.quit()); // o remapeamento continua no helper
  app.on("before-quit", () => helper.stop());
}
