import { Battery, BatteryLow, Download, FileText, FolderOpen, Languages, Power, RefreshCw, ShieldAlert, Trash2, TriangleAlert, X } from "lucide-react";
import type { HelperStatus, InstallInfo } from "../lib/api";
import type { Settings } from "../shared/schema";
import { LANGUAGES, MESSAGES, type Language, type Messages } from "../shared/i18n";
import { useI18n, useT } from "../lib/i18n";
import { Button, cx, SectionLabel, Toggle } from "./ui";

/** Top banners: helper offline, missing permissions, invalid config. */
export function Banners({ connected, status, configError, install, busy, onLaunch, onInstall, onPermission }: {
  connected: boolean;
  status: HelperStatus | null;
  configError?: string;
  install: InstallInfo | null;
  busy: boolean;
  onLaunch: () => void;
  onInstall: () => void;
  onPermission: (kind: "inputMonitoring" | "accessibility") => void;
}) {
  const b = useT().banners;
  const items: React.ReactNode[] = [];
  if (!connected && install && !install.installed && install.bundled) {
    items.push(
      <Banner key="inst" icon={<Download className="h-4 w-4" />} text={b.notInstalled}
        action={<Button variant="primary" disabled={busy} onClick={onInstall}>{busy ? b.installing : b.installHelper}</Button>} />,
    );
  } else if (!connected) {
    items.push(
      <Banner key="off" icon={<Power className="h-4 w-4" />} text={b.notRunning}
        action={<Button variant="primary" onClick={onLaunch}>{b.startHelper}</Button>} />,
    );
  } else if (status) {
    if (!status.inputMonitoring)
      items.push(<Banner key="im" icon={<ShieldAlert className="h-4 w-4" />} text={b.needInputMonitoring}
        action={<Button onClick={() => onPermission("inputMonitoring")}>{b.openSettings}</Button>} />);
    if (!status.accessibility)
      items.push(<Banner key="ax" icon={<ShieldAlert className="h-4 w-4" />} text={b.needAccessibility}
        action={<Button onClick={() => onPermission("accessibility")}>{b.openSettings}</Button>} />);
    if (status.inputMonitoring && !status.hidOpen)
      items.push(<Banner key="hid" icon={<TriangleAlert className="h-4 w-4" />} text={b.restartForPermission} />);
  }
  if (connected && install?.upToDate === false) {
    items.push(<Banner key="upd" icon={<RefreshCw className="h-4 w-4" />} text={b.updateAvailable}
      action={<Button disabled={busy} onClick={onInstall}>{busy ? b.updating : b.updateHelper}</Button>} />);
  }
  if (configError) items.push(<Banner key="cfg" icon={<TriangleAlert className="h-4 w-4" />} text={configError} />);
  if (!items.length) return null;
  return <div className="space-y-2">{items}</div>;
}

function Banner({ icon, text, action }: { icon: React.ReactNode; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[12px]">
      <span className="text-warn">{icon}</span>
      <span className="flex-1">{text}</span>
      {action}
    </div>
  );
}

/** Sidebar footer: mouse status. */
export function DeviceStatus({ connected, status, saveState }: { connected: boolean; status: HelperStatus | null; saveState: string }) {
  const t = useT();
  const ok = connected && status?.connected;
  const low = (status?.battery ?? 100) <= 20;
  return (
    <div className="rounded-lg bg-black/[0.04] px-2.5 py-2 text-[11px] dark:bg-white/[0.05]">
      <div className="flex items-center gap-1.5 font-medium">
        <span className={cx("h-2 w-2 rounded-full", ok ? "bg-ok" : "bg-faint")} />
        {!connected ? t.common.helperOffline : ok ? t.status.connected : t.status.disconnected}
        {ok && status?.battery != null && (
          <span className={cx("ml-auto flex items-center gap-1", low ? "text-danger" : "text-muted")}>
            {low ? <BatteryLow className="h-3.5 w-3.5" /> : <Battery className="h-3.5 w-3.5" />}{status.battery}%
          </span>
        )}
      </div>
      <div className="mt-0.5 text-muted">
        {connected && status && !status.enabled ? t.status.paused : saveState}
      </div>
    </div>
  );
}

export function SettingsSheet({ settings, status, connected, followMouse, onFollowMouse, onChange, onLanguage, onClose, onLaunchAtLogin, onOpenLog, onOpenFolder, install, busy, onInstall, onUninstall }: {
  install: InstallInfo | null;
  busy: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  settings: Settings;
  status: HelperStatus | null;
  connected: boolean;
  followMouse: boolean;
  onFollowMouse: (v: boolean) => void;
  onChange: (s: Settings) => void;
  onLanguage: (l: Language) => void;
  onClose: () => void;
  onLaunchAtLogin: (v: boolean) => void;
  onOpenLog: () => void;
  onOpenFolder: () => void;
}) {
  const { t, lang } = useI18n();
  const s = t.settings;
  const repeat = settings.tiltRepeatIntervalMs > 0;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/25 pt-16" onClick={onClose}>
      <div className="w-[460px] rounded-2xl border border-line bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">{s.title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-3"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="language" className="flex items-center gap-2 text-[13px] font-medium">
              <Languages className="h-4 w-4 text-muted" /> {s.language}
            </label>
            <select id="language" value={lang} onChange={(e) => onLanguage(e.target.value as Language)}
              className="rounded-md border border-line-strong bg-surface px-2 py-1 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft">
              {LANGUAGES.map((l) => <option key={l} value={l}>{MESSAGES[l].languageName}</option>)}
            </select>
          </div>
          <Row title={s.remappingActive} desc={s.remappingActiveDesc}>
            <Toggle checked={settings.enabled} onChange={(v) => onChange({ ...settings, enabled: v })} label={s.remappingActive} />
          </Row>
          <Row title={s.launchAtLogin} desc={s.launchAtLoginDesc}>
            <Toggle checked={!!status?.launchAtLogin} disabled={!connected} onChange={onLaunchAtLogin} label={s.launchAtLogin} />
          </Row>
          <Row title={s.followMouse} desc={s.followMouseDesc}>
            <Toggle checked={followMouse} onChange={onFollowMouse} label={s.followMouse} />
          </Row>

          <div>
            <SectionLabel>{s.gestureSensitivity}</SectionLabel>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-muted">{s.sensitive}</span>
              <input type="range" min={20} max={300} step={10} value={settings.gestureThreshold}
                onChange={(e) => onChange({ ...settings, gestureThreshold: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
              <span className="text-[11px] text-muted">{s.firm}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted">{s.thresholdHint(settings.gestureThreshold)}</p>
          </div>

          <div>
            <Row title={s.tiltRepeat} desc={s.tiltRepeatDesc}>
              <Toggle checked={repeat} onChange={(v) => onChange({ ...settings, tiltRepeatIntervalMs: v ? 150 : 0 })} label={s.tiltRepeatLabel} />
            </Row>
            {repeat && (
              <div className="mt-2 flex items-center gap-3">
                <span className="text-[11px] text-muted">{s.fast}</span>
                <input type="range" min={50} max={600} step={25} value={settings.tiltRepeatIntervalMs}
                  onChange={(e) => onChange({ ...settings, tiltRepeatIntervalMs: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
                <span className="text-[11px] text-muted">{s.slow}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 border-t border-line pt-4">
            <Button onClick={onOpenLog}><FileText className="h-3.5 w-3.5" /> {s.helperLog}</Button>
            <Button onClick={onOpenFolder}><FolderOpen className="h-3.5 w-3.5" /> {s.configFolder}</Button>
          </div>
          <div className="border-t border-line pt-4">
            <SectionLabel>{s.installation}</SectionLabel>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[12px]">
                <div className="font-medium">M535 Remap Helper</div>
                <div className="text-[11px] text-muted">{installText(s, install)}</div>
              </div>
              {install?.bundled && (
                <Button disabled={busy} onClick={onInstall}>
                  {install.installed ? <RefreshCw className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                  {busy ? s.wait : !install.installed ? s.install : install.upToDate === false ? s.update : s.reinstall}
                </Button>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-[11px] text-muted">{s.uninstallDesc}</div>
              <Button variant="danger" disabled={busy || !install?.canUninstall} onClick={onUninstall}>
                <Trash2 className="h-3.5 w-3.5" /> {s.uninstall}
              </Button>
            </div>
          </div>
          {status && <p className="text-[11px] text-faint">Helper {status.version} · {status.configPath}</p>}
        </div>
      </div>
    </div>
  );
}

function installText(s: Messages["settings"], i: InstallInfo | null): string {
  if (!i) return s.checking;
  if (!i.installed) return i.bundled ? s.notInstalled : s.notInstalledDev;
  const v = i.installedVersion ? `v${i.installedVersion}` : s.installed;
  if (i.upToDate === false) return `${v} · ${s.updateAvailable(i.bundledVersion ?? "?")}`;
  if (i.upToDate === true) return `${v} · ${s.upToDate}`;
  return `${v} · ${s.inApplications}`;
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[13px] font-medium">{title}</div>
        <div className="text-[11px] text-muted">{desc}</div>
      </div>
      {children}
    </div>
  );
}
