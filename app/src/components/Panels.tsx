import { Battery, BatteryLow, Download, FileText, FolderOpen, Power, RefreshCw, ShieldAlert, Trash2, TriangleAlert, X } from "lucide-react";
import type { HelperStatus, InstallInfo } from "../lib/api";
import type { Settings } from "../shared/schema";
import { Button, cx, SectionLabel, Toggle } from "./ui";

/** Avisos no topo: helper offline, permissões pendentes, config inválido. */
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
  const items: React.ReactNode[] = [];
  if (!connected && install && !install.installed && install.bundled) {
    items.push(
      <Banner key="inst" icon={<Download className="h-4 w-4" />} text="O M535 Remap Helper ainda não está instalado — é ele que remapeia os botões em segundo plano."
        action={<Button variant="primary" disabled={busy} onClick={onInstall}>{busy ? "Instalando…" : "Instalar helper"}</Button>} />,
    );
  } else if (!connected) {
    items.push(
      <Banner key="off" icon={<Power className="h-4 w-4" />} text="O helper não está rodando — os botões do mouse não serão remapeados."
        action={<Button variant="primary" onClick={onLaunch}>Iniciar helper</Button>} />,
    );
  } else if (status) {
    if (!status.inputMonitoring)
      items.push(<Banner key="im" icon={<ShieldAlert className="h-4 w-4" />} text="Falta a permissão de Monitoramento de Entrada para o M535 Remap ler o mouse."
        action={<Button onClick={() => onPermission("inputMonitoring")}>Abrir Ajustes</Button>} />);
    if (!status.accessibility)
      items.push(<Banner key="ax" icon={<ShieldAlert className="h-4 w-4" />} text="Falta a permissão de Acessibilidade para o M535 Remap enviar atalhos e ações."
        action={<Button onClick={() => onPermission("accessibility")}>Abrir Ajustes</Button>} />);
    if (status.inputMonitoring && !status.hidOpen)
      items.push(<Banner key="hid" icon={<TriangleAlert className="h-4 w-4" />} text="Permissão concedida — reinicie o helper pelo menu da barra (Reiniciar helper) para aplicá-la." />);
  }
  if (connected && install?.upToDate === false) {
    items.push(<Banner key="upd" icon={<RefreshCw className="h-4 w-4" />} text="Este app traz uma versão mais nova do helper."
      action={<Button disabled={busy} onClick={onInstall}>{busy ? "Atualizando…" : "Atualizar helper"}</Button>} />);
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

/** Rodapé da barra lateral: estado do mouse. */
export function DeviceStatus({ connected, status, saveState }: { connected: boolean; status: HelperStatus | null; saveState: string }) {
  const ok = connected && status?.connected;
  const low = (status?.battery ?? 100) <= 20;
  return (
    <div className="rounded-lg bg-black/[0.04] px-2.5 py-2 text-[11px] dark:bg-white/[0.05]">
      <div className="flex items-center gap-1.5 font-medium">
        <span className={cx("h-2 w-2 rounded-full", ok ? "bg-ok" : "bg-faint")} />
        {!connected ? "Helper offline" : ok ? "M535 conectado" : "Mouse desconectado"}
        {ok && status?.battery != null && (
          <span className={cx("ml-auto flex items-center gap-1", low ? "text-danger" : "text-muted")}>
            {low ? <BatteryLow className="h-3.5 w-3.5" /> : <Battery className="h-3.5 w-3.5" />}{status.battery}%
          </span>
        )}
      </div>
      <div className="mt-0.5 text-muted">
        {connected && status && !status.enabled ? "Remapeamento pausado" : saveState}
      </div>
    </div>
  );
}

export function SettingsSheet({ settings, status, connected, followMouse, onFollowMouse, onChange, onClose, onLaunchAtLogin, onOpenLog, onOpenFolder, install, busy, onInstall, onUninstall }: {
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
  onClose: () => void;
  onLaunchAtLogin: (v: boolean) => void;
  onOpenLog: () => void;
  onOpenFolder: () => void;
}) {
  const repeat = settings.tiltRepeatIntervalMs > 0;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/25 pt-16" onClick={onClose}>
      <div className="w-[460px] rounded-2xl border border-line bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">Ajustes</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-3"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4">
          <Row title="Remapeamento ativo" desc="Desligado, o mouse volta ao comportamento de fábrica.">
            <Toggle checked={settings.enabled} onChange={(v) => onChange({ ...settings, enabled: v })} label="Remapeamento ativo" />
          </Row>
          <Row title="Iniciar com o macOS" desc="Abre o helper da barra de menus no login.">
            <Toggle checked={!!status?.launchAtLogin} disabled={!connected} onChange={onLaunchAtLogin} label="Iniciar com o macOS" />
          </Row>
          <Row title="Selecionar ao pressionar" desc="Ao usar um controle do mouse, ele é selecionado aqui.">
            <Toggle checked={followMouse} onChange={onFollowMouse} label="Selecionar ao pressionar" />
          </Row>

          <div>
            <SectionLabel>Sensibilidade do gesto</SectionLabel>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-muted">Sensível</span>
              <input type="range" min={20} max={300} step={10} value={settings.gestureThreshold}
                onChange={(e) => onChange({ ...settings, gestureThreshold: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
              <span className="text-[11px] text-muted">Firme</span>
            </div>
            <p className="mt-1 text-[11px] text-muted">Movimento mínimo para o clique virar gesto ({settings.gestureThreshold}).</p>
          </div>

          <div>
            <Row title="Repetir tilt enquanto inclinado" desc="Útil para Voltar/aba/volume em sequência.">
              <Toggle checked={repeat} onChange={(v) => onChange({ ...settings, tiltRepeatIntervalMs: v ? 150 : 0 })} label="Repetir tilt" />
            </Row>
            {repeat && (
              <div className="mt-2 flex items-center gap-3">
                <span className="text-[11px] text-muted">Rápido</span>
                <input type="range" min={50} max={600} step={25} value={settings.tiltRepeatIntervalMs}
                  onChange={(e) => onChange({ ...settings, tiltRepeatIntervalMs: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
                <span className="text-[11px] text-muted">Lento</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 border-t border-line pt-4">
            <Button onClick={onOpenLog}><FileText className="h-3.5 w-3.5" /> Log do helper</Button>
            <Button onClick={onOpenFolder}><FolderOpen className="h-3.5 w-3.5" /> Pasta da configuração</Button>
          </div>
          <div className="border-t border-line pt-4">
            <SectionLabel>Instalação</SectionLabel>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[12px]">
                <div className="font-medium">M535 Remap Helper</div>
                <div className="text-[11px] text-muted">{installText(install)}</div>
              </div>
              {install?.bundled && (
                <Button disabled={busy} onClick={onInstall}>
                  {install.installed ? <RefreshCw className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                  {busy ? "Aguarde…" : !install.installed ? "Instalar" : install.upToDate === false ? "Atualizar" : "Reinstalar"}
                </Button>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-[11px] text-muted">Remove apps, configuração, logs, item de login e permissões.</div>
              <Button variant="danger" disabled={busy || !install?.canUninstall} onClick={onUninstall}>
                <Trash2 className="h-3.5 w-3.5" /> Desinstalar…
              </Button>
            </div>
          </div>
          {status && <p className="text-[11px] text-faint">Helper {status.version} · {status.configPath}</p>}
        </div>
      </div>
    </div>
  );
}

function installText(i: InstallInfo | null): string {
  if (!i) return "Verificando…";
  if (!i.installed) return i.bundled ? "Não instalado" : "Não instalado (empacote o app com npm run package)";
  const v = i.installedVersion ? `v${i.installedVersion}` : "instalado";
  if (i.upToDate === false) return `${v} · atualização disponível (v${i.bundledVersion})`;
  if (i.upToDate === true) return `${v} · atualizado`;
  return `${v} · em ~/Applications`;
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
