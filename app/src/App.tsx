import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause } from "lucide-react";
import {
  defaultConfig, effectiveAction, isControlId,
  type Action, type Config, type ControlId, type SelectableId, type Settings,
} from "./shared/schema";
import { describeAction } from "./data/actions";
import { api, primeAppInfo, type HelperEvent, type HelperStatus, type InstallInfo } from "./lib/api";
import { GesturePad, MouseDiagram } from "./components/MouseDiagram";
import { ActionEditor } from "./components/ActionEditor";
import { Sidebar } from "./components/Sidebar";
import { Banners, DeviceStatus, SettingsSheet } from "./components/Panels";
import { Toggle } from "./components/ui";
import { useI18n } from "./lib/i18n";
import { isLanguage, type Language } from "./shared/i18n";

const PHYSICAL_TO_CONTROL: Record<string, SelectableId> = {
  gesture: "gestureClick", tiltLeft: "tiltLeft", tiltRight: "tiltRight", middle: "middleClick",
};

function readPref(key: string, fallback: boolean) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === "1"; } catch { return fallback; }
}
function writePref(key: string, v: boolean) {
  try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* no storage */ }
}

type SaveState = { kind: "saved" } | { kind: "saving" } | { kind: "error"; error: string };

export default function App() {
  const { t, lang, setLang } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState<string>();
  const [profileId, setProfileId] = useState("default");
  const [selected, setSelected] = useState<SelectableId>("gestureUp");
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<HelperStatus | null>(null);
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const [scrollDir, setScrollDir] = useState<"up" | "down" | null>(null);
  const scrollTimer = useRef<number | undefined>(undefined);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "saved" });
  const [showSettings, setShowSettings] = useState(() => location.hash === "#settings");
  const [install, setInstall] = useState<InstallInfo | null>(null);
  const [installBusy, setInstallBusy] = useState(false);
  const [followMouse, setFollowMouse] = useState(() => readPref("followMouse", true));

  const saveTimer = useRef<number | undefined>(undefined);
  const configRef = useRef<Config | null>(null);
  const followRef = useRef(followMouse);
  followRef.current = followMouse;
  const profileRef = useRef(profileId);
  profileRef.current = profileId;

  // Initial load + events.
  useEffect(() => {
    api.loadConfig().then((r) => { setConfig(r.config); configRef.current = r.config; setConfigError(r.error); });
    api.helperState().then((s) => { setConnected(s.connected); setStatus(s.status); });
    api.installInfo().then(setInstall).catch(() => {});
    const offConn = api.onHelperConnection((c) => { setConnected(c); if (!c) setPressed(new Set()); });
    const offExt = api.onConfigExternal((r) => { setConfig(r.config); configRef.current = r.config; setConfigError(r.error); });
    const offEv = api.onHelperEvent((e: HelperEvent) => {
      if (e.event === "status") setStatus(e.data);
      if (e.event === "configError") setConfigError(e.data?.message);
      if (e.event === "control") onControlEvent(e.data.control, e.data.phase);
    });
    return () => { offConn(); offExt(); offEv(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onControlEvent = (control: string, phase: string) => {
    if (phase === "scrollUp" || phase === "scrollDown") {
      setScrollDir(phase === "scrollUp" ? "up" : "down");
      window.clearTimeout(scrollTimer.current);
      scrollTimer.current = window.setTimeout(() => setScrollDir(null), 350);
      return;
    }
    if (phase === "down") {
      setPressed((s) => new Set(s).add(control));
      if (followRef.current && PHYSICAL_TO_CONTROL[control] && control !== "gesture") setSelected(PHYSICAL_TO_CONTROL[control]);
    } else if (phase === "up") {
      setPressed((s) => { const n = new Set(s); n.delete(control); return n; });
    } else if (phase === "fire") {
      setFlashing((s) => new Set(s).add(control));
      setTimeout(() => setFlashing((s) => { const n = new Set(s); n.delete(control); return n; }), 650);
      if (followRef.current && isControlId(control)) setSelected(control);
      const c = configRef.current;
      if (c) {
        const prof = c.profiles.find((p) => p.id === profileRef.current) ? profileRef.current : "default";
        const a = effectiveAction(c, prof, control as ControlId).action;
        const tr = tRef.current;
        const short = isControlId(control) ? tr.controls[control].short : control;
        setToast({ id: Date.now(), text: `${short} → ${describeAction(tr, a).title}` });
      }
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // Debounced autosave — the helper reloads config.json on its own.
  const update = useCallback((fn: (c: Config) => Config) => {
    setConfig((prev) => {
      const next = fn(structuredClone(prev ?? defaultConfig()));
      configRef.current = next;
      setSaveState({ kind: "saving" });
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        const r = await api.saveConfig(next);
        setSaveState(r.ok ? { kind: "saved" } : { kind: "error", error: r.error ?? "" });
        if (r.ok) setConfigError(undefined);
      }, 350);
      return next;
    });
  }, []);

  // The language lives in config.json so the helper's menu follows it. If the file has one (e.g. chosen
  // earlier, or edited by hand), adopt it; if it has none yet, store the current one.
  const configLang = config?.settings.language;
  const hasConfig = !!config;
  useEffect(() => {
    if (!hasConfig) return;
    if (isLanguage(configLang)) { if (configLang !== lang) setLang(configLang); }
    // Never write while config.json is invalid: the UI is showing defaults and would overwrite the user's file.
    else if (!configError) update((c) => { c.settings.language = lang; return c; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configLang, hasConfig, configError]);

  const changeLanguage = (l: Language) => {
    setLang(l);
    if (!configError) update((c) => { c.settings.language = l; return c; });
  };

  const profile = config?.profiles.find((p) => p.id === profileId) ?? config?.profiles[0];
  const isDefault = profile?.id === "default";

  const actionOf = useCallback((id: ControlId) => (config && profile ? effectiveAction(config, profile.id, id).action : { type: "none" as const }), [config, profile]);
  const current = useMemo(() => {
    if (!config || !profile || selected === "leftClick" || selected === "rightClick" || selected === "scroll") return { action: undefined, inherited: false };
    return effectiveAction(config, profile.id, selected);
  }, [config, profile, selected]);

  const setAction = useCallback((a: Action) => {
    if (!profile) return;
    update((c) => {
      const p = c.profiles.find((x) => x.id === profile.id)!;
      p.bindings[selected] = a;
      return c;
    });
  }, [profile, selected, update]);

  const inherit = () => {
    if (!profile) return;
    update((c) => {
      delete c.profiles.find((x) => x.id === profile.id)!.bindings[selected];
      return c;
    });
  };

  const addAppProfile = async () => {
    const app = await api.pickApp();
    if (!app?.bundleId || !config) return;
    primeAppInfo(app);
    const existing = config.profiles.find((p) => p.apps.includes(app.bundleId!));
    if (existing) { setProfileId(existing.id); return; }
    const id = app.bundleId.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
    update((c) => { c.profiles.push({ id, name: app.name, apps: [app.bundleId!], bindings: {} }); return c; });
    setProfileId(id);
  };

  const deleteProfile = (id: string) => {
    const p = config?.profiles.find((x) => x.id === id);
    if (!p || !window.confirm(t.app.confirmDeleteProfile(p.name))) return;
    update((c) => { c.profiles = c.profiles.filter((x) => x.id !== id); return c; });
    if (profileId === id) setProfileId("default");
  };

  const setSettings = (s: Settings) => update((c) => { c.settings = s; return c; });

  const installHelper = async () => {
    setInstallBusy(true);
    try {
      setInstall(await api.installHelper());
      setToast({ id: Date.now(), text: t.app.helperInstalled });
    } catch (e) {
      setToast({ id: Date.now(), text: t.app.installFailed((e as Error).message) });
    } finally {
      setInstallBusy(false);
    }
  };

  const uninstall = async () => {
    try { await api.uninstall(); } catch (e) { setToast({ id: Date.now(), text: (e as Error).message }); }
  };

  const helperCall = async (method: string, params?: Record<string, unknown>) => {
    try {
      const r = await api.helperCall(method, params);
      if (r && typeof r === "object" && "version" in r) setStatus(r as HelperStatus);
    } catch (e) {
      setToast({ id: Date.now(), text: t.app.helperError((e as Error).message) });
    }
  };

  if (!config || !profile) return <div className="flex h-full items-center justify-center text-muted">{t.common.loading}</div>;

  const appName = (a: Action) => (a.type === "openApp" ? a.name : undefined);
  const saveText = saveState.kind === "saved" ? t.app.saved : saveState.kind === "saving" ? t.app.saving : t.app.saveError(saveState.error);

  return (
    <div className="flex h-full">
      <Sidebar
        profiles={config.profiles}
        selectedId={profile.id}
        onSelect={setProfileId}
        onAddApp={addAppProfile}
        onDelete={deleteProfile}
        onOpenSettings={() => setShowSettings(true)}
        footer={<DeviceStatus connected={connected} status={status} saveState={saveText} />}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-surface">
        <header className="drag flex h-[52px] shrink-0 items-center justify-between border-b border-line px-5">
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold">{isDefault ? t.defaultProfileName : profile.name}</h1>
          </div>
          <label className="no-drag flex items-center gap-2 text-[12px] text-muted">
            {!config.settings.enabled && <Pause className="h-3.5 w-3.5 text-warn" />}
            {t.app.remapping}
            <Toggle checked={config.settings.enabled} onChange={(v) => setSettings({ ...config.settings, enabled: v })} label={t.app.remappingActive} />
          </label>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-5">
            <Banners connected={connected} status={status} configError={configError}
              install={install} busy={installBusy} onInstall={installHelper}
              onLaunch={() => api.launchHelper()}
              onPermission={(kind) => helperCall("requestPermission", { kind })} />

            <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-6">
              <section className="flex flex-col items-center gap-5">
                <MouseDiagram selected={selected} onSelect={setSelected} actionOf={actionOf} pressed={pressed} scrollDir={scrollDir} />
                <div className="w-full max-w-[460px]">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">{t.app.gestureButton}</span>
                    <span className="text-[11px] text-faint">{t.app.gestureHint}</span>
                  </div>
                  <GesturePad selected={selected} onSelect={setSelected} actionOf={actionOf} flashing={flashing} appName={appName} />
                </div>
              </section>

              <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
                <ActionEditor
                  key={`${profile.id}:${selected}`}
                  control={selected}
                  action={current.action}
                  inherited={current.inherited}
                  isDefaultProfile={isDefault}
                  helperConnected={connected}
                  onChange={setAction}
                  onInherit={inherit}
                  onTest={(a) => helperCall("runAction", { action: a })}
                />
              </section>
            </div>
          </div>
        </div>
      </main>

      {toast && (
        <div key={toast.id} className="toast-in fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-fg px-4 py-2 text-[12px] font-medium text-surface shadow-lg">
          {toast.text}
        </div>
      )}

      {showSettings && (
        <SettingsSheet
          settings={config.settings}
          status={status}
          connected={connected}
          followMouse={followMouse}
          onFollowMouse={(v) => { setFollowMouse(v); writePref("followMouse", v); }}
          onChange={setSettings}
          onLanguage={changeLanguage}
          onClose={() => setShowSettings(false)}
          onLaunchAtLogin={(v) => helperCall("setLaunchAtLogin", { enabled: v })}
          onOpenLog={() => api.openLog()}
          onOpenFolder={() => api.openConfigFolder()}
          install={install}
          busy={installBusy}
          onInstall={installHelper}
          onUninstall={uninstall}
        />
      )}
    </div>
  );
}
