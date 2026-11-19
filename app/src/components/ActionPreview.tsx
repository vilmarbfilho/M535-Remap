import { useId } from "react";
import type { Action } from "../shared/schema";
import { describeAction, SYSTEM_BY_ID } from "../data/actions";
import { useAppInfo } from "../lib/api";
import { useT } from "../lib/i18n";
import { Shortcut } from "./ui";

/** Illustration of what the action does + title and description. */
export function ActionPreview({ action }: { action: Action }) {
  const t = useT();
  const app = useAppInfo(action.type === "openApp" ? action.bundleId ?? action.path : undefined);
  const d = describeAction(t, action, app?.name);
  const sys = action.type === "system" && action.action ? SYSTEM_BY_ID[action.action] : undefined;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
      <div className="flex h-36 items-center justify-center px-4">
        <Illustration action={action} appIcon={app?.icon} />
      </div>
      <div className="border-t border-line bg-surface px-4 py-3">
        <div className="text-[14px] font-semibold">{d.title}</div>
        {d.detail && <div className="mt-0.5 truncate text-[12px] text-muted" title={d.detail}>{d.detail}</div>}
        {sys?.shortcut && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
            {t.preview.sentAs} <Shortcut modifiers={sys.shortcut.mods} label={sys.shortcut.key} size="sm" />
          </div>
        )}
      </div>
    </div>
  );
}

function Illustration({ action, appIcon }: { action: Action; appIcon?: string }) {
  const t = useT();
  switch (action.type) {
    case "keystroke":
      return action.keyCode === undefined
        ? <span className="text-muted">{t.preview.clickRecord}</span>
        : <Shortcut modifiers={action.modifiers} label={action.keyLabel ?? `#${action.keyCode}`} size="lg" />;
    case "openApp":
      return appIcon
        ? <img src={appIcon} alt="" className="h-20 w-20 drop-shadow-md" />
        : <span className="text-muted">{t.preview.chooseApp}</span>;
    case "shell":
      return (
        <div className="w-full max-w-[300px] rounded-lg bg-[#1d1f21] p-3 font-mono text-[11px] text-[#c5c8c6] shadow-inner">
          <span className="text-[#b5bd68]">$</span> {action.command?.trim() || "…"}
        </div>
      );
    case "system":
      return <SystemIllustration id={action.action ?? ""} />;
    default: {
      const Icon = describeAction(t, action).icon;
      return <Icon className="h-14 w-14 text-faint" strokeWidth={1.5} />;
    }
  }
}

const A = "var(--accent)";
const WIN = "var(--pv-win)";
const LINE = "var(--pv-line)";

function Win({ x, y, w, h, fill = WIN, opacity = 1 }: { x: number; y: number; w: number; h: number; fill?: string; opacity?: number }) {
  return (
    <g opacity={opacity}>
      <rect x={x} y={y} width={w} height={h} rx={3} fill={fill} stroke={LINE} />
      <line x1={x} x2={x + w} y1={y + 6} y2={y + 6} stroke={LINE} />
      <circle cx={x + 4} cy={y + 3} r={1.2} fill="#ff5f57" />
      <circle cx={x + 8} cy={y + 3} r={1.2} fill="#febc2e" />
      <circle cx={x + 12} cy={y + 3} r={1.2} fill="#28c840" />
    </g>
  );
}

function Screen({ children, x = 4, w = 152 }: { children?: React.ReactNode; x?: number; w?: number }) {
  return (
    <>
      <rect x={x} y={4} width={w} height={92} rx={8} fill="var(--pv-screen)" stroke={LINE} />
      {children}
    </>
  );
}

function SystemIllustration({ id }: { id: string }) {
  const t = useT();
  const clip = useId();
  const meta = SYSTEM_BY_ID[id];
  let body: React.ReactNode;

  switch (id) {
    case "missionControl":
      body = (
        <Screen>
          {[0, 1, 2].map((i) => (
            <rect key={i} x={40 + i * 28} y={10} width={22} height={13} rx={2} fill={i === 0 ? A : WIN} opacity={i === 0 ? 0.85 : 1} stroke={LINE} />
          ))}
          <Win x={20} y={32} w={54} h={28} /><Win x={86} y={32} w={54} h={28} />
          <Win x={20} y={64} w={54} h={26} /><Win x={86} y={64} w={54} h={26} />
        </Screen>
      );
      break;
    case "appExpose":
      body = (
        <Screen>
          <rect x={4} y={4} width={152} height={92} rx={8} fill="#000" opacity={0.18} />
          <Win x={14} y={34} w={40} h={32} /><Win x={60} y={30} w={40} h={38} /><Win x={106} y={34} w={40} h={32} />
          <rect x={60} y={74} width={40} height={4} rx={2} fill={A} />
        </Screen>
      );
      break;
    case "showDesktop":
      body = (
        <>
          <defs><clipPath id={clip}><rect x={4} y={4} width={152} height={92} rx={8} /></clipPath></defs>
          <Screen />
          <g clipPath={`url(#${clip})`}>
            <Win x={-22} y={-10} w={60} h={36} /><Win x={124} y={-12} w={60} h={36} />
            <Win x={-24} y={72} w={60} h={36} /><Win x={126} y={74} w={60} h={36} />
          </g>
          {[0, 1, 2].map((i) => <rect key={i} x={64 + i * 12} y={44} width={8} height={10} rx={1.5} fill={A} opacity={0.7} />)}
        </>
      );
      break;
    case "launchpad":
      body = (
        <Screen>
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x={30 + (i % 4) * 26} y={20 + Math.floor(i / 4) * 24} width={16} height={16} rx={4}
              fill={i % 5 === 0 ? A : WIN} stroke={LINE} />
          ))}
        </Screen>
      );
      break;
    case "spaceLeft":
    case "spaceRight": {
      const right = id === "spaceRight";
      body = (
        <>
          <rect x={4} y={20} width={64} height={46} rx={5} fill="var(--pv-screen)" stroke={right ? LINE : A} strokeWidth={right ? 1 : 2} />
          <rect x={92} y={20} width={64} height={46} rx={5} fill="var(--pv-screen)" stroke={right ? A : LINE} strokeWidth={right ? 2 : 1} />
          <Win x={12} y={28} w={30} h={20} /><Win x={110} y={34} w={36} h={24} />
          <path d={right ? "M72 43 h14 m-5 -5 l5 5 l-5 5" : "M88 43 h-14 m5 -5 l-5 5 l5 5"} stroke={A} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <text x={36} y={80} textAnchor="middle" fontSize={8} fill="var(--fg-muted)">{t.preview.desktop(1)}</text>
          <text x={124} y={80} textAnchor="middle" fontSize={8} fill="var(--fg-muted)">{t.preview.desktop(2)}</text>
        </>
      );
      break;
    }
    case "back":
    case "forward": {
      const fwd = id === "forward";
      body = (
        <Screen>
          <rect x={14} y={12} width={132} height={76} rx={4} fill={WIN} stroke={LINE} />
          <rect x={44} y={17} width={96} height={7} rx={3.5} fill="var(--pv-screen)" />
          <path d="M22 20.5 l-3 -0 m0 0 l2 -2 m-2 2 l2 2" stroke={fwd ? LINE : A} strokeWidth={1.4} fill="none" />
          <path d="M30 20.5 l3 0 m0 0 l-2 -2 m2 2 l-2 2" stroke={fwd ? A : LINE} strokeWidth={1.4} fill="none" />
          <path d={fwd ? "M62 56 h34 m-10 -10 l10 10 l-10 10" : "M98 56 h-34 m10 -10 l-10 10 l10 10"} stroke={A} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Screen>
      );
      break;
    }
    default: {
      const Icon = meta?.icon;
      return Icon ? <Icon className="h-14 w-14 text-accent" strokeWidth={1.5} /> : null;
    }
  }
  return <svg viewBox="0 0 160 100" className="h-full max-h-32 w-auto" aria-hidden>{body}</svg>;
}
