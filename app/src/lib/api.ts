import { useEffect, useState } from "react";
import type { Config } from "../shared/schema";
import type { Language } from "../shared/i18n";

export interface AppInfo { bundleId?: string; name: string; path: string; icon?: string }

export interface HelperStatus {
  version: string;
  connected: boolean;
  deviceName: string | null;
  battery: number | null;
  hidOpen: boolean;
  inputMonitoring: boolean;
  accessibility: boolean;
  enabled: boolean;
  activeApp: string | null;
  activeProfileId: string | null;
  activeProfileName: string | null;
  configPath: string;
  configError: string | null;
  launchAtLogin: boolean;
  systemActions: string[];
}

export interface InstallInfo {
  installed: boolean;
  installedVersion: string | null;
  bundled: boolean;
  bundledVersion: string | null;
  upToDate: boolean | null;
  canUninstall: boolean;
}

export interface HelperEvent { event: string; data: any }
export interface RecorderKey { code: string; key: string; shift: boolean; control: boolean; alt: boolean; meta: boolean }

export interface M535Api {
  loadConfig(): Promise<{ config: Config; error?: string }>;
  saveConfig(c: Config): Promise<{ ok: boolean; error?: string }>;
  helperState(): Promise<{ connected: boolean; status: HelperStatus | null }>;
  helperCall(method: string, params?: Record<string, unknown>): Promise<unknown>;
  launchHelper(): Promise<boolean>;
  installInfo(): Promise<InstallInfo>;
  installHelper(): Promise<InstallInfo>;
  uninstall(): Promise<boolean>;
  pickApp(): Promise<AppInfo | null>;
  appInfo(idOrPath: string): Promise<AppInfo | null>;
  pickFile(): Promise<string | null>;
  setRecording(on: boolean): Promise<void>;
  openLog(): Promise<void>;
  openConfigFolder(): Promise<void>;
  setLanguage(lang: Language): Promise<void>;
  onHelperEvent(cb: (e: HelperEvent) => void): () => void;
  onHelperConnection(cb: (c: boolean) => void): () => void;
  onConfigExternal(cb: (r: { config: Config; error?: string }) => void): () => void;
  onRecorderKey(cb: (k: RecorderKey) => void): () => void;
}

declare global {
  interface Window { m535: M535Api }
}

export const api: M535Api = window.m535;

const appInfoCache = new Map<string, Promise<AppInfo | null>>();

/** An app's name + icon from its bundle id or path (cached). */
export function useAppInfo(idOrPath: string | undefined): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    if (!idOrPath) { setInfo(null); return; }
    let alive = true;
    if (!appInfoCache.has(idOrPath)) appInfoCache.set(idOrPath, api.appInfo(idOrPath).catch(() => null));
    appInfoCache.get(idOrPath)!.then((i) => { if (alive) setInfo(i); });
    return () => { alive = false; };
  }, [idOrPath]);
  return info;
}

export function primeAppInfo(info: AppInfo) {
  const p = Promise.resolve(info);
  if (info.bundleId) appInfoCache.set(info.bundleId, p);
  appInfoCache.set(info.path, p);
}
