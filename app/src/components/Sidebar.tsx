import { Layers, Plus, Settings, Trash2 } from "lucide-react";
import type { Profile } from "../shared/schema";
import { useAppInfo } from "../lib/api";
import { cx } from "./ui";

interface Props {
  profiles: Profile[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAddApp: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  footer: React.ReactNode;
}

export function Sidebar(p: Props) {
  return (
    <aside className="flex w-[230px] shrink-0 flex-col border-r border-line">
      <div className="drag h-[52px] shrink-0" />
      <div className="px-3">
        <div className="mb-1.5 px-2 text-[11px] font-semibold text-muted">Perfis</div>
        <nav className="space-y-0.5">
          {p.profiles.map((pr) => (
            <ProfileRow key={pr.id} profile={pr} selected={pr.id === p.selectedId}
              onSelect={() => p.onSelect(pr.id)} onDelete={pr.id === "default" ? undefined : () => p.onDelete(pr.id)} />
          ))}
        </nav>
        <button type="button" onClick={p.onAddApp}
          className="mt-1.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-black/5 hover:text-fg dark:hover:bg-white/5">
          <Plus className="h-4 w-4" /> Perfil para um app…
        </button>
        <p className="mt-2 px-2 text-[11px] leading-snug text-faint">
          Perfis de app ficam ativos quando o app está em primeiro plano. Controles não personalizados usam o Padrão.
        </p>
      </div>

      <div className="mt-auto space-y-2 p-3">
        <button type="button" onClick={p.onOpenSettings}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-black/5 dark:hover:bg-white/5">
          <Settings className="h-4 w-4 text-muted" /> Ajustes
        </button>
        {p.footer}
      </div>
    </aside>
  );
}

function ProfileRow({ profile, selected, onSelect, onDelete }: { profile: Profile; selected: boolean; onSelect: () => void; onDelete?: () => void }) {
  const info = useAppInfo(profile.apps[0]);
  const custom = Object.keys(profile.bindings).length;
  return (
    <div className={cx(
      "group flex items-center gap-2 rounded-md px-2 py-1.5",
      selected ? "bg-accent text-accent-fg" : "hover:bg-black/5 dark:hover:bg-white/5",
    )} onClick={onSelect} role="button">
      {profile.id === "default"
        ? <Layers className={cx("h-[18px] w-[18px]", selected ? "text-accent-fg" : "text-accent")} />
        : info?.icon ? <img src={info.icon} alt="" className="h-[18px] w-[18px]" /> : <span className="h-[18px] w-[18px] rounded bg-surface-3" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">{profile.name}</span>
        {profile.id !== "default" && (
          <span className={cx("block text-[10px]", selected ? "text-accent-fg/80" : "text-muted")}>
            {custom === 0 ? "herda tudo do Padrão" : `${custom} personalizado${custom > 1 ? "s" : ""}`}
          </span>
        )}
      </span>
      {onDelete && (
        <button type="button" title="Remover perfil" onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className={cx("rounded p-0.5 opacity-0 group-hover:opacity-100", selected ? "hover:bg-white/20" : "hover:bg-black/10")}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
