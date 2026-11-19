import type { ButtonHTMLAttributes, ReactNode } from "react";
import { MODIFIER_NAME, MODIFIER_SYMBOL, sortModifiers } from "../shared/keycodes";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function KeyCap({ children, size = "md", title }: { children: ReactNode; size?: "sm" | "md" | "lg"; title?: string }) {
  return (
    <kbd
      title={title}
      className={cx(
        "inline-flex items-center justify-center rounded-[6px] border border-line-strong bg-cap font-sans font-medium text-fg",
        "shadow-[0_1px_0_var(--cap-shadow)]",
        size === "lg" && "h-11 min-w-11 px-3 text-lg",
        size === "md" && "h-7 min-w-7 px-2 text-sm",
        size === "sm" && "h-5 min-w-5 px-1 text-[11px]",
      )}
    >
      {children}
    </kbd>
  );
}

export function Shortcut({ modifiers, label, size = "md" }: { modifiers?: string[]; label?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className="inline-flex items-center gap-1">
      {sortModifiers(modifiers ?? []).map((m) => (
        <KeyCap key={m} size={size} title={MODIFIER_NAME[m]}>{MODIFIER_SYMBOL[m] ?? m}</KeyCap>
      ))}
      {label && <KeyCap size={size}>{label}</KeyCap>}
    </span>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors disabled:opacity-40",
        checked ? "bg-accent" : "bg-surface-3 ring-1 ring-line ring-inset",
      )}
    >
      <span className={cx("absolute h-[18px] w-[18px] rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-[2px]")} />
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-surface-3 p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
            value === o.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
export function Button({ variant = "secondary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
        variant === "primary" && "bg-accent text-accent-fg hover:brightness-110",
        variant === "secondary" && "border border-line-strong bg-surface text-fg shadow-sm hover:bg-surface-2",
        variant === "ghost" && "text-muted hover:bg-surface-3 hover:text-fg",
        variant === "danger" && "text-danger hover:bg-surface-3",
        className,
      )}
    />
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">{children}</div>;
}
