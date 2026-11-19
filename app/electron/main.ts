import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ConfigSchema, defaultConfig, type Config } from "../src/shared/schema";
import { isLanguage, languageFromLocale, MESSAGES, type Language } from "../src/shared/i18n";
import { HelperClient } from "./helperClient";

const execFileP = promisify(execFile);

const SUPPORT_DIR = path.join(os.homedir(), "Library/Application Support/M535Remap");
const CONFIG_PATH = path.join(SUPPORT_DIR, "config.json");
const SOCKET_PATH = path.join(SUPPORT_DIR, "helper.sock");
const LOG_PATH = path.join(os.homedir(), "Library/Logs/M535Remap/helper.log");
const HELPER_BUNDLE_ID = "com.m535remap.helper";
const HELPER_APP_PATH = path.join(os.homedir(), "Applications/M535 Remap Helper.app");
const BUNDLED_HELPER = path.join(process.resourcesPath, "M535 Remap Helper.app");

/** Uninstaller: in the packaged app it lives in Resources; in development, in the repository. */
function uninstallScript(): string {
  return app.isPackaged ? path.join(process.resourcesPath, "uninstall.sh") : path.resolve(app.getAppPath(), "../scripts/uninstall.sh");
}

let win: BrowserWindow | null = null;
let recording = false;
let lastWritten = "";
// UI language: set by the renderer (Settings → Language); until then, follows the system locale.
let language: Language = "en";
const m = () => MESSAGES[language].main;
const helper = new HelperClient(SOCKET_PATH, m);

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
    return { config: defaultConfig(), error: m().invalidConfig(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")) };
  } catch (e) {
    return { config: defaultConfig(), error: m().invalidJson((e as Error).message) };
  }
}

function writeConfig(c: unknown): { ok: boolean; error?: string } {
  const parsed = ConfigSchema.safeParse(c);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  const text = JSON.stringify(parsed.data, null, 2) + "\n";
  fs.mkdirSync(SUPPORT_DIR, { recursive: true });
  const tmp = CONFIG_PATH + ".tmp";
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, CONFIG_PATH); // atomic: the helper reloads when it sees the directory change
  lastWritten = text;
  return { ok: true };
}

/** Notifies the UI when config.json changes externally (e.g. "Remapping enabled" in the helper menu). */
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
  } catch { /* some apps have an unreadable binary plist; carry on with just the name */ }
  let icon: string | undefined;
  try { icon = (await app.getFileIcon(appPath, { size: "large" })).toDataURL(); } catch { /* no icon */ }
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

// MARK: install / uninstall

async function cdHash(appPath: string): Promise<string | null> {
  try {
    const { stderr } = await execFileP("/usr/bin/codesign", ["-dvvv", appPath]);
    return /CDHash=([0-9a-f]+)/.exec(stderr)?.[1] ?? null;
  } catch {
    return null;
  }
}

async function plistVersion(appPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileP("/usr/libexec/PlistBuddy", ["-c", "Print CFBundleShortVersionString", path.join(appPath, "Contents/Info.plist")]);
    return stdout.trim();
  } catch {
    return null;
  }
}

interface InstallInfo {
  installed: boolean;
  installedVersion: string | null;
  bundled: boolean;
  bundledVersion: string | null;
  /** null when there's no bundled helper to compare against (development mode). */
  upToDate: boolean | null;
  canUninstall: boolean;
}

async function installInfo(): Promise<InstallInfo> {
  const installed = fs.existsSync(HELPER_APP_PATH);
  const bundled = app.isPackaged && fs.existsSync(BUNDLED_HELPER);
  let upToDate: boolean | null = null;
  if (installed && bundled) {
    const [a, b] = await Promise.all([cdHash(HELPER_APP_PATH), cdHash(BUNDLED_HELPER)]);
    upToDate = !!a && a === b; // CDHash: same code, regardless of when it was signed
  }
  return {
    installed,
    installedVersion: installed ? await plistVersion(HELPER_APP_PATH) : null,
    bundled,
    bundledVersion: bundled ? await plistVersion(BUNDLED_HELPER) : null,
    upToDate,
    canUninstall: fs.existsSync(uninstallScript()),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function helperRunning(): Promise<boolean> {
  try { await execFileP("/usr/bin/pgrep", ["-x", "M535Helper"]); return true; } catch { return false; }
}

/** Copies the bundled helper to ~/Applications (quitting the old one, which restores the mouse) and starts it. */
async function installHelper(): Promise<InstallInfo> {
  if (!fs.existsSync(BUNDLED_HELPER)) throw new Error(m().noBundledHelper);
  if (await helperRunning()) {
    try { await execFileP("/usr/bin/pkill", ["-TERM", "-x", "M535Helper"]); } catch { /* already exited */ }
    for (let i = 0; i < 20 && (await helperRunning()); i++) await sleep(250);
  }
  fs.mkdirSync(path.dirname(HELPER_APP_PATH), { recursive: true });
  fs.rmSync(HELPER_APP_PATH, { recursive: true, force: true });
  fs.cpSync(BUNDLED_HELPER, HELPER_APP_PATH, { recursive: true, verbatimSymlinks: true });
  await execFileP("/usr/bin/open", [HELPER_APP_PATH]);
  setTimeout(() => helper.poke(), 800);
  return installInfo();
}

/** Asks for confirmation and runs the detached uninstaller; the app quits so it can be removed. */
async function uninstall(): Promise<boolean> {
  if (!win) return false;
  const script = uninstallScript();
  if (!fs.existsSync(script)) throw new Error(m().uninstallerNotFound(script));
  const r = await dialog.showMessageBox(win, {
    type: "warning",
    message: m().uninstallTitle,
    detail: m().uninstallDetail(app.isPackaged),
    buttons: [m().uninstall, m().cancel],
    defaultId: 1,
    cancelId: 1,
    checkboxLabel: m().removeCert,
    checkboxChecked: false,
  });
  if (r.response !== 0) return false;

  const args = [script, "--yes", "--wait-pid", String(process.pid)];
  if (app.isPackaged) args.push("--ui-app", path.resolve(process.execPath, "../../.."));
  else args.push("--keep-ui");
  if (r.checkboxChecked) args.push("--remove-cert");
  const logFile = path.join(os.tmpdir(), "m535remap-uninstall.log");
  const out = fs.openSync(logFile, "w");
  spawn("/bin/bash", args, { detached: true, stdio: ["ignore", out, out] }).unref();
  helper.stop();
  setTimeout(() => app.quit(), 300);
  return true;
}

const ALLOWED_METHODS = new Set(["status", "setEnabled", "runAction", "requestPermission", "setLaunchAtLogin", "reloadConfig"]);

// MARK: window

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
  else win.loadFile(path.join(__dirname, "../dist/index.html"), { hash: process.env.M535_HASH ?? "" });

  win.once("ready-to-show", () => win?.show());

  // Development: M535_SCREENSHOT=/path.png [M535_THEME=dark|light] renders the window to a PNG and quits.
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

  // Shortcut recording: intercepts keys before menu shortcuts (⌘W, ⌘Q…) and the renderer itself.
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
    if (!ALLOWED_METHODS.has(method)) throw new Error(m().methodNotAllowed);
    return helper.call(method, params ?? {});
  });
  ipcMain.handle("helper:launch", () => launchHelper());
  ipcMain.handle("install:info", () => installInfo());
  ipcMain.handle("install:helper", () => installHelper());
  ipcMain.handle("install:uninstall", () => uninstall());
  ipcMain.handle("app:pick", async () => {
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, {
      title: m().chooseApp,
      defaultPath: "/Applications",
      properties: ["openFile"],
      filters: [{ name: m().applications, extensions: ["app"] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const info = await appInfoFromPath(r.filePaths[0]);
    if (info?.bundleId) appCache.set(info.bundleId, info);
    return info;
  });
  ipcMain.handle("app:info", (_e, idOrPath: string) => appInfo(idOrPath));
  ipcMain.handle("file:pick", async () => {
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, { title: m().chooseFile, properties: ["openFile", "openDirectory"] });
    return r.canceled ? null : r.filePaths[0] ?? null;
  });
  ipcMain.handle("recorder:set", (_e, on: boolean) => { recording = !!on; });
  ipcMain.handle("shell:openLog", () => shell.openPath(LOG_PATH));
  ipcMain.handle("shell:openConfigFolder", () => shell.openPath(SUPPORT_DIR));
  ipcMain.handle("app:setLanguage", (_e, lang: unknown) => { if (isLanguage(lang)) language = lang; });

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
    try { lastWritten = fs.readFileSync(CONFIG_PATH, "utf8"); } catch { /* doesn't exist yet */ }
    language = languageFromLocale(app.getLocale());
    registerIpc();
    watchConfig();
    helper.start();
    createWindow();
    app.on("activate", () => { if (!win) createWindow(); });
  });
  app.on("window-all-closed", () => app.quit()); // remapping keeps running in the helper
  app.on("before-quit", () => helper.stop());
}
