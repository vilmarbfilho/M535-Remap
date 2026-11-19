import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

function on<T>(channel: string, cb: (v: T) => void) {
  const h = (_e: IpcRendererEvent, v: T) => cb(v);
  ipcRenderer.on(channel, h);
  return () => { ipcRenderer.removeListener(channel, h); };
}

contextBridge.exposeInMainWorld("m535", {
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (c: unknown) => ipcRenderer.invoke("config:save", c),
  helperState: () => ipcRenderer.invoke("helper:state"),
  helperCall: (method: string, params?: Record<string, unknown>) => ipcRenderer.invoke("helper:call", method, params),
  launchHelper: () => ipcRenderer.invoke("helper:launch"),
  installInfo: () => ipcRenderer.invoke("install:info"),
  installHelper: () => ipcRenderer.invoke("install:helper"),
  uninstall: () => ipcRenderer.invoke("install:uninstall"),
  pickApp: () => ipcRenderer.invoke("app:pick"),
  appInfo: (idOrPath: string) => ipcRenderer.invoke("app:info", idOrPath),
  pickFile: () => ipcRenderer.invoke("file:pick"),
  setRecording: (on: boolean) => ipcRenderer.invoke("recorder:set", on),
  openLog: () => ipcRenderer.invoke("shell:openLog"),
  openConfigFolder: () => ipcRenderer.invoke("shell:openConfigFolder"),
  onHelperEvent: (cb: (e: unknown) => void) => on("helper:event", cb),
  onHelperConnection: (cb: (c: boolean) => void) => on("helper:connection", cb),
  onConfigExternal: (cb: (r: unknown) => void) => on("config:external", cb),
  onRecorderKey: (cb: (k: unknown) => void) => on("recorder:key", cb),
});
