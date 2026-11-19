import { useEffect, useRef, useState } from "react";
import {
  AppWindow, Ban, FolderOpen, Keyboard, Link, Lock, Monitor, MousePointerClick, Play,
  SquareTerminal, TriangleAlert, Undo2,
} from "lucide-react";
import {
  CONTROL_META, isActionComplete, isLocked, type Action, type ActionType, type ControlId, type SelectableId,
} from "../shared/schema";
import { keyLabel, CODE_TO_MAC } from "../shared/keycodes";
import { CATEGORIES, SYSTEM_ACTIONS } from "../data/actions";
import { api, primeAppInfo, useAppInfo } from "../lib/api";
import { ActionPreview } from "./ActionPreview";
import { Button, cx, SectionLabel, Segmented, Shortcut, Toggle } from "./ui";

interface Props {
  control: SelectableId;
  action: Action | undefined;
  inherited: boolean;
  isDefaultProfile: boolean;
  helperConnected: boolean;
  onChange: (a: Action) => void;
  onInherit: () => void;
  onTest: (a: Action) => void;
}

const TYPE_OPTIONS: { value: ActionType; label: string; icon: React.ReactNode }[] = [
  { value: "system", label: "Sistema", icon: <Monitor className="h-3.5 w-3.5" /> },
  { value: "keystroke", label: "Atalho", icon: <Keyboard className="h-3.5 w-3.5" /> },
  { value: "openApp", label: "App", icon: <AppWindow className="h-3.5 w-3.5" /> },
  { value: "openURL", label: "Link/Arquivo", icon: <Link className="h-3.5 w-3.5" /> },
  { value: "shell", label: "Shell", icon: <SquareTerminal className="h-3.5 w-3.5" /> },
  { value: "none", label: "Nenhuma", icon: <Ban className="h-3.5 w-3.5" /> },
];

function initialFor(type: ActionType): Action {
  switch (type) {
    case "system": return { type, action: "missionControl" };
    case "openURL": return { type, url: "" };
    case "shell": return { type, command: "" };
    default: return { type };
  }
}

export function ActionEditor(p: Props) {
  const meta = CONTROL_META[p.control];

  if (isLocked(p.control)) {
    return (
      <div className="space-y-4">
        <Header title={meta.label} hint={meta.hint} />
        <div className="flex gap-3 rounded-xl border border-line bg-surface-2 p-4 text-[13px] text-muted">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Este controle funciona de forma <b className="text-fg">nativa</b> pelo macOS e não é remapeado nesta versão.
            Ajuste velocidade e direção da rolagem em Ajustes do Sistema → Mouse.
          </div>
        </div>
      </div>
    );
  }

  const control = p.control as ControlId;
  const action = p.action ?? { type: "none" };
  const options = control === "middleClick"
    ? [{ value: "default" as ActionType, label: "Nativo", icon: <MousePointerClick className="h-3.5 w-3.5" /> }, ...TYPE_OPTIONS]
    : TYPE_OPTIONS;

  return (
    <div className="space-y-4">
      <Header title={meta.label} hint={meta.hint} />

      {!p.isDefaultProfile && (
        <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[12px]">
          {p.inherited
            ? <span className="text-muted">Usando a ação do perfil <b className="text-fg">Padrão</b></span>
            : <span className="text-accent">Personalizado neste perfil</span>}
          {!p.inherited && (
            <Button variant="ghost" className="!px-2 !py-1 text-[12px]" onClick={p.onInherit}>
              <Undo2 className="h-3.5 w-3.5" /> Herdar do Padrão
            </Button>
          )}
        </div>
      )}

      <ActionPreview action={action} />

      <div className="flex items-center gap-2">
        <Button onClick={() => p.onTest(action)} disabled={!p.helperConnected || !isActionComplete(action) || action.type === "none" || action.type === "default"}>
          <Play className="h-3.5 w-3.5" /> Testar ação
        </Button>
        {!p.helperConnected && <span className="text-[11px] text-muted">Helper offline</span>}
      </div>

      <SectionLabel>Ação</SectionLabel>
      <Segmented options={options} value={action.type} onChange={(t) => p.onChange(initialFor(t))} />

      <div>
        {action.type === "system" && <SystemPicker value={action.action} onChange={(id) => p.onChange({ type: "system", action: id })} />}
        {action.type === "keystroke" && <KeystrokeEditor action={action} onChange={p.onChange} />}
        {action.type === "openApp" && <AppEditor action={action} onChange={p.onChange} />}
        {action.type === "openURL" && <UrlEditor action={action} onChange={p.onChange} />}
        {action.type === "shell" && <ShellEditor action={action} onChange={p.onChange} />}
        {action.type === "none" && <p className="text-[12px] text-muted">Este controle não fará nada.</p>}
        {action.type === "default" && <p className="text-[12px] text-muted">A roda se comporta como o clique do meio padrão do macOS (o helper nem intercepta este botão).</p>}
      </div>

    </div>
  );
}

function Header({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <p className="mt-0.5 text-[12px] text-muted">{hint}</p>
    </div>
  );
}

function SystemPicker({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  return (
    <div className="space-y-3">
      {CATEGORIES.map((cat) => (
        <div key={cat}>
          <SectionLabel>{cat}</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {SYSTEM_ACTIONS.filter((a) => a.category === cat).map((a) => {
              const Icon = a.icon;
              const on = a.id === value;
              return (
                <button key={a.id} type="button" onClick={() => onChange(a.id)} title={a.description}
                  className={cx(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px] transition-colors",
                    on ? "border-accent bg-accent-soft font-medium text-accent" : "border-line bg-surface hover:bg-surface-2",
                  )}>
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                  <span className="truncate">{a.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function KeystrokeEditor({ action, onChange }: { action: Action; onChange: (a: Action) => void }) {
  const [recording, setRecording] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!recording) return;
    void api.setRecording(true);
    const off = api.onRecorderKey((k) => {
      if (["MetaLeft", "MetaRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "ControlLeft", "ControlRight", "CapsLock", "Fn"].includes(k.code)) return;
      const plain = !k.meta && !k.control && !k.alt && !k.shift;
      if (k.code === "Escape" && plain) { setRecording(false); return; }
      const keyCode = CODE_TO_MAC[k.code];
      if (keyCode === undefined) return;
      const modifiers: string[] = [];
      if (k.control) modifiers.push("ctrl");
      if (k.alt) modifiers.push("option");
      if (k.shift) modifiers.push("shift");
      if (k.meta) modifiers.push("cmd");
      onChangeRef.current({ type: "keystroke", keyCode, modifiers, keyLabel: keyLabel(k.code, k.key) });
      setRecording(false);
    });
    return () => { off(); void api.setRecording(false); };
  }, [recording]);

  return (
    <div className="space-y-2">
      <div className={cx(
        "flex h-16 items-center justify-center rounded-xl border-2 border-dashed",
        recording ? "border-accent bg-accent-soft" : "border-line",
      )}>
        {recording
          ? <span className="text-[13px] font-medium text-accent">Pressione o atalho… (Esc cancela)</span>
          : action.keyCode !== undefined
            ? <Shortcut modifiers={action.modifiers} label={action.keyLabel} />
            : <span className="text-[12px] text-muted">Nenhum atalho gravado</span>}
      </div>
      <div className="flex items-center gap-2">
        <Button variant={recording ? "secondary" : "primary"} onClick={() => setRecording((r) => !r)}>
          <Keyboard className="h-3.5 w-3.5" /> {recording ? "Cancelar" : action.keyCode !== undefined ? "Gravar outro" : "Gravar atalho"}
        </Button>
        <span className="text-[11px] text-muted">Atalhos reservados pelo sistema (ex.: ⌘Espaço) não podem ser gravados.</span>
      </div>
    </div>
  );
}

function AppEditor({ action, onChange }: { action: Action; onChange: (a: Action) => void }) {
  const info = useAppInfo(action.bundleId ?? action.path);
  const pick = async () => {
    const app = await api.pickApp();
    if (!app) return;
    primeAppInfo(app);
    onChange({ type: "openApp", bundleId: app.bundleId, path: app.path, name: app.name, toggle: action.toggle });
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
        {info?.icon ? <img src={info.icon} alt="" className="h-10 w-10" /> : <AppWindow className="h-10 w-10 text-faint" strokeWidth={1.2} />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{info?.name ?? action.name ?? "Nenhum app escolhido"}</div>
          {(action.bundleId || action.path) && <div className="truncate text-[11px] text-muted">{action.bundleId ?? action.path}</div>}
        </div>
        <Button onClick={pick}><FolderOpen className="h-3.5 w-3.5" /> Escolher…</Button>
      </div>
      <label className="flex items-center justify-between gap-3 text-[12px]">
        <span>
          Ocultar se já estiver em primeiro plano
          <span className="block text-[11px] text-muted">Transforma o controle num “mostrar/ocultar” do app.</span>
        </span>
        <Toggle checked={!!action.toggle} onChange={(v) => onChange({ ...action, toggle: v })} label="Ocultar se em primeiro plano" />
      </label>
    </div>
  );
}

function UrlEditor({ action, onChange }: { action: Action; onChange: (a: Action) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input value={action.url ?? ""} onChange={(e) => onChange({ type: "openURL", url: e.target.value })}
          placeholder="https://… , ~/Downloads ou /caminho/arquivo"
          className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft" />
        <Button onClick={async () => { const f = await api.pickFile(); if (f) onChange({ type: "openURL", url: f }); }}>
          <FolderOpen className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-[11px] text-muted">Links abrem no navegador padrão; arquivos e pastas, no app associado.</p>
    </div>
  );
}

function ShellEditor({ action, onChange }: { action: Action; onChange: (a: Action) => void }) {
  return (
    <div className="space-y-2">
      <textarea value={action.command ?? ""} onChange={(e) => onChange({ type: "shell", command: e.target.value })}
        rows={3} spellCheck={false} placeholder="open -a Calculator"
        className="w-full resize-none rounded-md border border-line-strong bg-surface px-2.5 py-2 font-mono text-[12px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft" />
      <p className="flex items-start gap-1.5 text-[11px] text-warn">
        <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
        Executado com /bin/zsh -lc, com as suas permissões, em segundo plano e sem saída visível.
      </p>
    </div>
  );
}

