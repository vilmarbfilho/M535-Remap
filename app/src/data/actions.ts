import {
  AppWindow, ArrowLeft, ArrowRight, Ban, Camera, ChevronsLeft, ChevronsRight, FileText, Grid3x3,
  Keyboard, LayoutGrid, Link, Lock, Maximize2, Monitor, MousePointerClick, Play, Search,
  SkipBack, SkipForward, SquareTerminal, Volume1, Volume2, VolumeX, X, ZoomIn, ZoomOut,
  PanelRight, PanelLeft, type LucideIcon,
} from "lucide-react";
import type { Action } from "../shared/schema";
import { displayKeyLabel, MODIFIER_SYMBOL, sortModifiers } from "../shared/keycodes";
import type { Messages } from "../shared/i18n";

export type Category = keyof Messages["categories"];
export const CATEGORIES: Category[] = ["windows", "navigation", "media", "system"];
export type SystemActionId = keyof Messages["systemActions"];

export interface SystemActionMeta {
  id: SystemActionId;
  icon: LucideIcon;
  category: Category;
  /** Shortcut the helper sends (when the action is implemented as a shortcut). */
  shortcut?: { mods: string[]; key: string };
}

export const SYSTEM_ACTIONS: SystemActionMeta[] = [
  { id: "missionControl", icon: LayoutGrid, category: "windows" },
  { id: "appExpose", icon: AppWindow, category: "windows" },
  { id: "showDesktop", icon: Monitor, category: "windows" },
  { id: "launchpad", icon: Grid3x3, category: "windows" },
  { id: "spaceLeft", icon: ChevronsLeft, category: "windows", shortcut: { mods: ["ctrl"], key: "←" } },
  { id: "spaceRight", icon: ChevronsRight, category: "windows", shortcut: { mods: ["ctrl"], key: "→" } },
  { id: "fullscreen", icon: Maximize2, category: "windows", shortcut: { mods: ["ctrl", "cmd"], key: "F" } },
  { id: "closeWindow", icon: X, category: "windows", shortcut: { mods: ["cmd"], key: "W" } },

  { id: "back", icon: ArrowLeft, category: "navigation", shortcut: { mods: ["cmd"], key: "[" } },
  { id: "forward", icon: ArrowRight, category: "navigation", shortcut: { mods: ["cmd"], key: "]" } },
  { id: "previousTab", icon: PanelLeft, category: "navigation", shortcut: { mods: ["ctrl", "shift"], key: "⇥" } },
  { id: "nextTab", icon: PanelRight, category: "navigation", shortcut: { mods: ["ctrl"], key: "⇥" } },
  { id: "zoomIn", icon: ZoomIn, category: "navigation", shortcut: { mods: ["cmd"], key: "=" } },
  { id: "zoomOut", icon: ZoomOut, category: "navigation", shortcut: { mods: ["cmd"], key: "−" } },
  { id: "middleClick", icon: MousePointerClick, category: "navigation" },

  { id: "playPause", icon: Play, category: "media" },
  { id: "nextTrack", icon: SkipForward, category: "media" },
  { id: "previousTrack", icon: SkipBack, category: "media" },
  { id: "volumeUp", icon: Volume2, category: "media" },
  { id: "volumeDown", icon: Volume1, category: "media" },
  { id: "mute", icon: VolumeX, category: "media" },

  { id: "spotlight", icon: Search, category: "system", shortcut: { mods: ["cmd"], key: "Space" } },
  { id: "screenshot", icon: Camera, category: "system", shortcut: { mods: ["shift", "cmd"], key: "5" } },
  { id: "lockScreen", icon: Lock, category: "system", shortcut: { mods: ["ctrl", "cmd"], key: "Q" } },
];

export const SYSTEM_BY_ID: Record<string, SystemActionMeta | undefined> = Object.fromEntries(SYSTEM_ACTIONS.map((a) => [a.id, a]));

/** Translated label + description of a system action. */
export function systemText(t: Messages, id: SystemActionId) {
  return t.systemActions[id];
}

export function shortcutText(t: Messages, mods: string[] | undefined, key: string | undefined): string {
  return sortModifiers(mods ?? []).map((m) => MODIFIER_SYMBOL[m] ?? m).join("") + displayKeyLabel(key ?? "", t.keys.space);
}

/** Short summary of an action for lists, diagram captions and toasts. */
export function describeAction(t: Messages, a: Action | undefined, appName?: string): { title: string; detail?: string; icon: LucideIcon } {
  const d = t.describe;
  if (!a) return { title: d.noAction, icon: Ban };
  switch (a.type) {
    case "system": {
      const m = a.action ? SYSTEM_BY_ID[a.action] : undefined;
      if (!m) return { title: a.action ?? d.systemAction, icon: Monitor };
      const txt = systemText(t, m.id);
      return { title: txt.label, detail: txt.description, icon: m.icon };
    }
    case "keystroke":
      return a.keyCode === undefined
        ? { title: d.shortcutNotSet, icon: Keyboard }
        : { title: shortcutText(t, a.modifiers, a.keyLabel ?? `#${a.keyCode}`), detail: d.sendsShortcut, icon: Keyboard };
    case "openApp":
      return { title: d.openApp(appName ?? a.name ?? a.bundleId ?? d.app), detail: a.toggle ? d.hidesIfFrontmost : undefined, icon: AppWindow };
    case "openURL": {
      const u = a.url ?? "";
      const isFile = u.startsWith("/") || u.startsWith("~");
      return { title: isFile ? d.openFile : d.openLink, detail: u || undefined, icon: isFile ? FileText : Link };
    }
    case "shell":
      return { title: d.runCommand, detail: a.command || undefined, icon: SquareTerminal };
    case "default":
      return { title: d.nativeMiddleClick, detail: d.macDefault, icon: MousePointerClick };
    default:
      return { title: d.noAction, icon: Ban };
  }
}
