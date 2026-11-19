import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Circle, Lock } from "lucide-react";
import type { ControlId, SelectableId } from "../shared/schema";
import { describeAction } from "../data/actions";
import type { Action } from "../shared/schema";
import { cx } from "./ui";

type PhysicalId = "gesture" | "tiltLeft" | "tiltRight" | "middle" | "leftClick" | "rightClick";

interface Props {
  selected: SelectableId;
  onSelect: (id: SelectableId) => void;
  actionOf: (id: ControlId) => Action;
  /** Controles físicos pressionados agora (eventos ao vivo do helper). */
  pressed: Set<string>;
  /** Direção da rolagem física recente (some sozinha após ~350 ms). */
  scrollDir: "up" | "down" | null;
}

const OX = 150, OY = 8; // deslocamento do corpo do mouse no viewBox

interface Callout {
  id: SelectableId;
  side: "left" | "right";
  anchor: [number, number]; // coordenadas do mouse
  y: number;
  label: string;
  locked?: boolean;
}

const CALLOUTS: Callout[] = [
  { id: "leftClick", side: "left", anchor: [80, 100], y: 62, label: "Botão esquerdo", locked: true },
  { id: "tiltLeft", side: "left", anchor: [101, 84], y: 140, label: "Tilt ←" },
  { id: "gestureClick", side: "left", anchor: [119, 137], y: 222, label: "Botão de gestos" },
  { id: "rightClick", side: "right", anchor: [180, 100], y: 62, label: "Botão direito", locked: true },
  { id: "tiltRight", side: "right", anchor: [159, 84], y: 140, label: "Tilt →" },
  { id: "middleClick", side: "right", anchor: [141, 68], y: 222, label: "Clique na roda" },
  { id: "scroll", side: "right", anchor: [141, 102], y: 296, label: "Rolagem", locked: true },
];

const isGesture = (id: SelectableId) => id.startsWith("gesture");

export function MouseDiagram({ selected, onSelect, actionOf, pressed, scrollDir }: Props) {
  const sel = (id: SelectableId) => (id === "gestureClick" ? isGesture(selected) : selected === id);
  const fillFor = (id: SelectableId, phys?: PhysicalId, base = "var(--mouse-button)") =>
    phys && pressed.has(phys) ? "var(--accent)" : sel(id) ? "var(--accent-soft)" : base;
  const strokeFor = (id: SelectableId) => (sel(id) ? "var(--accent)" : "var(--mouse-stroke)");

  const summary = (c: Callout) => {
    if (c.locked) return "Nativo do macOS";
    if (c.id === "gestureClick") return "5 ações · veja abaixo";
    return describeAction(actionOf(c.id as ControlId)).title;
  };

  return (
    <svg viewBox="0 0 560 410" className="w-full max-w-[560px] select-none" role="group" aria-label="Diagrama do Logitech M535">
      {/* Leaders + legendas */}
      {CALLOUTS.map((c) => {
        const ax = c.anchor[0] + OX, ay = c.anchor[1] + OY;
        const lx = c.side === "left" ? 156 : 404;
        const active = sel(c.id);
        return (
          <g key={c.id} className="cursor-pointer" onClick={() => onSelect(c.id)}>
            <path d={`M${ax} ${ay} L${lx} ${c.y - 4}`} stroke={active ? "var(--accent)" : "var(--line-strong)"} strokeWidth={active ? 1.5 : 1} fill="none" />
            <circle cx={ax} cy={ay} r={2.5} fill={active ? "var(--accent)" : "var(--fg-faint)"} />
            <text x={c.side === "left" ? lx - 6 : lx + 6} y={c.y} textAnchor={c.side === "left" ? "end" : "start"}
              fontSize={13} fontWeight={600} fill={active ? "var(--accent)" : "var(--fg)"}>
              {c.label}
            </text>
            <text x={c.side === "left" ? lx - 6 : lx + 6} y={c.y + 16} textAnchor={c.side === "left" ? "end" : "start"}
              fontSize={11} fill="var(--fg-muted)">
              {truncate(summary(c), 24)}
            </text>
            {/* área de clique generosa para a legenda */}
            <rect x={c.side === "left" ? 0 : lx} y={c.y - 16} width={156} height={38} fill="transparent" />
          </g>
        );
      })}

      <g transform={`translate(${OX} ${OY})`}>
        {/* Corpo */}
        <path d="M130 18 C 72 18, 40 58, 38 140 L 37 272 C 37 344, 80 392, 130 392 C 180 392, 223 344, 223 272 L 222 140 C 220 58, 188 18, 130 18 Z"
          fill="var(--mouse-body)" stroke="var(--mouse-stroke)" strokeWidth={1.5} />
        <path d="M60 330 C 90 360, 170 360, 200 330" stroke="var(--mouse-stroke)" fill="none" opacity={0.5} />

        {/* Botões esquerdo / direito */}
        <path className="cursor-pointer" onClick={() => onSelect("leftClick")}
          d="M128 20 L 128 184 C 96 184, 62 178, 38.6 170 L 38.6 140 C 40.6 62, 72 20, 128 20 Z"
          fill={fillFor("leftClick", "leftClick")} stroke={strokeFor("leftClick")} strokeWidth={1.2} />
        <path className="cursor-pointer" onClick={() => onSelect("rightClick")}
          d="M132 20 L 132 184 C 164 184, 198 178, 221.4 170 L 221.4 140 C 219.4 62, 188 20, 132 20 Z"
          fill={fillFor("rightClick", "rightClick")} stroke={strokeFor("rightClick")} strokeWidth={1.2} />

        {/* Canal da roda */}
        <rect x={112} y={44} width={36} height={116} rx={18} fill="var(--mouse-slot)" />

        {/* Roda (clique do meio) */}
        <g className="cursor-pointer" onClick={() => onSelect("middleClick")}>
          <rect x={119} y={52} width={22} height={62} rx={11}
            fill={pressed.has("middle") ? "var(--accent)" : "var(--mouse-wheel)"}
            stroke={scrollDir || sel("middleClick") || sel("scroll") ? "var(--accent)" : "transparent"} strokeWidth={2} />
          {Array.from({ length: 9 }, (_, i) => (
            <line key={i} x1={122} x2={138} y1={58 + i * 6} y2={58 + i * 6} stroke="var(--mouse-slot)" strokeOpacity={0.45} />
          ))}
        </g>

        {/* Rolagem ao vivo: seta acima ou abaixo da roda */}
        {scrollDir && (
          <path className="pointer-events-none"
            d={scrollDir === "up" ? "M123 41 L130 34 L137 41" : "M124 115.5 L130 121 L136 115.5"}
            stroke="var(--accent)" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Tilt ← / → */}
        <TiltArrow x={101} y={84} dir="left" selected={sel("tiltLeft")} active={pressed.has("tiltLeft")} onClick={() => onSelect("tiltLeft")} />
        <TiltArrow x={159} y={84} dir="right" selected={sel("tiltRight")} active={pressed.has("tiltRight")} onClick={() => onSelect("tiltRight")} />

        {/* Botão de gestos */}
        <rect className="cursor-pointer" onClick={() => onSelect("gestureClick")}
          x={120} y={124} width={20} height={28} rx={7}
          fill={fillFor("gestureClick", "gesture", "var(--mouse-button)")}
          stroke={strokeFor("gestureClick")} strokeWidth={1.5} />

        {/* Logo */}
        <text x={130} y={300} textAnchor="middle" fontSize={11} letterSpacing={2} fill="var(--fg-faint)">logi</text>
      </g>
    </svg>
  );
}

function TiltArrow({ x, y, dir, selected, active, onClick }: { x: number; y: number; dir: "left" | "right"; selected: boolean; active: boolean; onClick: () => void }) {
  const d = dir === "left" ? `M${x + 3} ${y - 5} L${x - 3} ${y} L${x + 3} ${y + 5}` : `M${x - 3} ${y - 5} L${x + 3} ${y} L${x - 3} ${y + 5}`;
  return (
    <g className="cursor-pointer" onClick={onClick}>
      <circle cx={x} cy={y} r={10} fill={active ? "var(--accent)" : selected ? "var(--accent-soft)" : "var(--surface)"}
        stroke={selected ? "var(--accent)" : "var(--mouse-stroke)"} strokeWidth={1.2} />
      <path d={d} stroke={active ? "#fff" : selected ? "var(--accent)" : "var(--fg-muted)"} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// MARK: Pad de gestos

const PAD: { id: ControlId; icon: typeof ArrowUp; area: string }[] = [
  { id: "gestureUp", icon: ArrowUp, area: "col-start-2 row-start-1" },
  { id: "gestureLeft", icon: ArrowLeft, area: "col-start-1 row-start-2" },
  { id: "gestureClick", icon: Circle, area: "col-start-2 row-start-2" },
  { id: "gestureRight", icon: ArrowRight, area: "col-start-3 row-start-2" },
  { id: "gestureDown", icon: ArrowDown, area: "col-start-2 row-start-3" },
];

export function GesturePad({ selected, onSelect, actionOf, flashing, appName }: {
  selected: SelectableId;
  onSelect: (id: SelectableId) => void;
  actionOf: (id: ControlId) => Action;
  flashing: Set<string>;
  appName: (a: Action) => string | undefined;
}) {
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-2">
      {PAD.map(({ id, icon: Arrow, area }) => {
        const a = actionOf(id);
        const d = describeAction(a, appName(a));
        const Icon = d.icon;
        const isSel = selected === id;
        return (
          <button key={id} type="button" onClick={() => onSelect(id)}
            className={cx(
              area,
              "flex h-[62px] flex-col items-start justify-between rounded-xl border px-3 py-2 text-left transition-colors",
              isSel ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-2",
              flashing.has(id) && "flash",
            )}>
            <span className={cx("flex items-center gap-1 text-[10px] font-semibold tracking-wide uppercase", isSel ? "text-accent" : "text-muted")}>
              <Arrow className="h-3 w-3" strokeWidth={2.5} />
              {id === "gestureClick" ? "Clique" : ""}
            </span>
            <span className="flex w-full items-center gap-1.5">
              <Icon className={cx("h-4 w-4 shrink-0", isSel ? "text-accent" : "text-fg")} strokeWidth={1.8} />
              <span className="truncate text-[12px] font-medium">{d.title}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function LockedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-muted">
      <Lock className="h-3 w-3" /> Nativo
    </span>
  );
}
