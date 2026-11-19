import {
  AppWindow, ArrowLeft, ArrowRight, Ban, Camera, ChevronsLeft, ChevronsRight, FileText, Grid3x3,
  Keyboard, LayoutGrid, Link, Lock, Maximize2, Monitor, MousePointerClick, Play, Search,
  SkipBack, SkipForward, SquareTerminal, Volume1, Volume2, VolumeX, X, ZoomIn, ZoomOut,
  PanelRight, PanelLeft, type LucideIcon,
} from "lucide-react";
import type { Action } from "../shared/schema";
import { MODIFIER_SYMBOL, sortModifiers } from "../shared/keycodes";

export type Category = "Janelas e desktops" | "Navegação" | "Mídia" | "Sistema";
export const CATEGORIES: Category[] = ["Janelas e desktops", "Navegação", "Mídia", "Sistema"];

export interface SystemActionMeta {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: Category;
  /** Atalho que o helper envia (quando a ação é implementada como atalho). */
  shortcut?: { mods: string[]; key: string };
}

export const SYSTEM_ACTIONS: SystemActionMeta[] = [
  { id: "missionControl", label: "Mission Control", description: "Mostra todas as janelas abertas e os desktops.", icon: LayoutGrid, category: "Janelas e desktops" },
  { id: "appExpose", label: "Janelas do app", description: "Mostra todas as janelas do app em primeiro plano (App Exposé).", icon: AppWindow, category: "Janelas e desktops" },
  { id: "showDesktop", label: "Mostrar mesa", description: "Afasta todas as janelas para mostrar a mesa.", icon: Monitor, category: "Janelas e desktops" },
  { id: "launchpad", label: "Launchpad", description: "Abre a grade de aplicativos.", icon: Grid3x3, category: "Janelas e desktops" },
  { id: "spaceLeft", label: "Desktop anterior", description: "Vai para o desktop (Space) à esquerda.", icon: ChevronsLeft, category: "Janelas e desktops", shortcut: { mods: ["ctrl"], key: "←" } },
  { id: "spaceRight", label: "Próximo desktop", description: "Vai para o desktop (Space) à direita.", icon: ChevronsRight, category: "Janelas e desktops", shortcut: { mods: ["ctrl"], key: "→" } },
  { id: "fullscreen", label: "Tela cheia", description: "Entra ou sai da tela cheia na janela atual.", icon: Maximize2, category: "Janelas e desktops", shortcut: { mods: ["ctrl", "cmd"], key: "F" } },
  { id: "closeWindow", label: "Fechar janela/aba", description: "Fecha a janela ou aba atual.", icon: X, category: "Janelas e desktops", shortcut: { mods: ["cmd"], key: "W" } },

  { id: "back", label: "Voltar", description: "Volta no navegador, Finder e outros apps.", icon: ArrowLeft, category: "Navegação", shortcut: { mods: ["cmd"], key: "[" } },
  { id: "forward", label: "Avançar", description: "Avança no navegador, Finder e outros apps.", icon: ArrowRight, category: "Navegação", shortcut: { mods: ["cmd"], key: "]" } },
  { id: "previousTab", label: "Aba anterior", description: "Vai para a aba à esquerda.", icon: PanelLeft, category: "Navegação", shortcut: { mods: ["ctrl", "shift"], key: "⇥" } },
  { id: "nextTab", label: "Próxima aba", description: "Vai para a aba à direita.", icon: PanelRight, category: "Navegação", shortcut: { mods: ["ctrl"], key: "⇥" } },
  { id: "zoomIn", label: "Aumentar zoom", description: "Aumenta o zoom do conteúdo.", icon: ZoomIn, category: "Navegação", shortcut: { mods: ["cmd"], key: "=" } },
  { id: "zoomOut", label: "Diminuir zoom", description: "Diminui o zoom do conteúdo.", icon: ZoomOut, category: "Navegação", shortcut: { mods: ["cmd"], key: "−" } },
  { id: "middleClick", label: "Clique do meio", description: "Simula o clique do meio (abrir link em nova aba, fechar aba…).", icon: MousePointerClick, category: "Navegação" },

  { id: "playPause", label: "Reproduzir/Pausar", description: "Tecla de mídia ⏯.", icon: Play, category: "Mídia" },
  { id: "nextTrack", label: "Próxima faixa", description: "Tecla de mídia ⏭.", icon: SkipForward, category: "Mídia" },
  { id: "previousTrack", label: "Faixa anterior", description: "Tecla de mídia ⏮.", icon: SkipBack, category: "Mídia" },
  { id: "volumeUp", label: "Aumentar volume", description: "Tecla de volume +.", icon: Volume2, category: "Mídia" },
  { id: "volumeDown", label: "Diminuir volume", description: "Tecla de volume −.", icon: Volume1, category: "Mídia" },
  { id: "mute", label: "Sem som", description: "Liga/desliga o som.", icon: VolumeX, category: "Mídia" },

  { id: "spotlight", label: "Spotlight", description: "Abre a busca do Spotlight.", icon: Search, category: "Sistema", shortcut: { mods: ["cmd"], key: "Espaço" } },
  { id: "screenshot", label: "Captura de tela", description: "Abre as opções de captura e gravação de tela.", icon: Camera, category: "Sistema", shortcut: { mods: ["shift", "cmd"], key: "5" } },
  { id: "lockScreen", label: "Bloquear tela", description: "Bloqueia o Mac imediatamente.", icon: Lock, category: "Sistema", shortcut: { mods: ["ctrl", "cmd"], key: "Q" } },
];

export const SYSTEM_BY_ID: Record<string, SystemActionMeta> = Object.fromEntries(SYSTEM_ACTIONS.map((a) => [a.id, a]));

export function shortcutText(mods: string[] | undefined, key: string | undefined): string {
  return sortModifiers(mods ?? []).map((m) => MODIFIER_SYMBOL[m] ?? m).join("") + (key ?? "");
}

/** Resumo curto de uma ação para listas, legendas do diagrama e toasts. */
export function describeAction(a: Action | undefined, appName?: string): { title: string; detail?: string; icon: LucideIcon } {
  if (!a) return { title: "Nenhuma ação", icon: Ban };
  switch (a.type) {
    case "system": {
      const m = a.action ? SYSTEM_BY_ID[a.action] : undefined;
      return m ? { title: m.label, detail: m.description, icon: m.icon } : { title: a.action ?? "Ação do sistema", icon: Monitor };
    }
    case "keystroke":
      return a.keyCode === undefined
        ? { title: "Atalho não definido", icon: Keyboard }
        : { title: shortcutText(a.modifiers, a.keyLabel ?? `#${a.keyCode}`), detail: "Envia este atalho de teclado", icon: Keyboard };
    case "openApp":
      return { title: `Abrir ${appName ?? a.name ?? a.bundleId ?? "app"}`, detail: a.toggle ? "Oculta se já estiver em primeiro plano" : undefined, icon: AppWindow };
    case "openURL": {
      const u = a.url ?? "";
      const isFile = u.startsWith("/") || u.startsWith("~");
      return { title: isFile ? "Abrir arquivo/pasta" : "Abrir link", detail: u || undefined, icon: isFile ? FileText : Link };
    }
    case "shell":
      return { title: "Executar comando", detail: a.command || undefined, icon: SquareTerminal };
    case "default":
      return { title: "Clique do meio (nativo)", detail: "Comportamento padrão do macOS", icon: MousePointerClick };
    default:
      return { title: "Nenhuma ação", icon: Ban };
  }
}
