// Esquema de config.json — espelha helper/Sources/M535Helper/Config/Config.swift.
import { z } from "zod";

export const ACTION_TYPES = ["none", "default", "system", "keystroke", "openApp", "openURL", "shell"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  action: z.string().optional(),
  keyCode: z.number().int().optional(),
  modifiers: z.array(z.string()).optional(),
  keyLabel: z.string().optional(),
  bundleId: z.string().optional(),
  path: z.string().optional(),
  name: z.string().optional(),
  toggle: z.boolean().optional(),
  url: z.string().optional(),
  command: z.string().optional(),
});
export type Action = z.infer<typeof ActionSchema>;

const DEFAULT_SETTINGS = { enabled: true, gestureThreshold: 50, tiltRepeatIntervalMs: 0, tiltRepeatDelayMs: 400 };

export const SettingsSchema = z.object({
  enabled: z.boolean().default(DEFAULT_SETTINGS.enabled),
  gestureThreshold: z.number().int().min(10).max(1000).default(DEFAULT_SETTINGS.gestureThreshold),
  tiltRepeatIntervalMs: z.number().int().min(0).max(5000).default(DEFAULT_SETTINGS.tiltRepeatIntervalMs),
  tiltRepeatDelayMs: z.number().int().min(0).max(5000).default(DEFAULT_SETTINGS.tiltRepeatDelayMs),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const ProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  apps: z.array(z.string()).default([]),
  bindings: z.record(z.string(), ActionSchema).default({}),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ConfigSchema = z.object({
  version: z.number().int().default(1),
  settings: SettingsSchema.default(DEFAULT_SETTINGS),
  profiles: z.array(ProfileSchema).default([]),
});
export type Config = z.infer<typeof ConfigSchema>;

// Controles remapeáveis (chaves de "bindings") e controles exibidos mas nativos.
export const CONTROL_IDS = [
  "gestureClick", "gestureUp", "gestureDown", "gestureLeft", "gestureRight",
  "tiltLeft", "tiltRight", "middleClick",
] as const;
export type ControlId = (typeof CONTROL_IDS)[number];
export type LockedId = "leftClick" | "rightClick" | "scroll";
export type SelectableId = ControlId | LockedId;

export const LOCKED_IDS: LockedId[] = ["leftClick", "rightClick", "scroll"];
export const isLocked = (id: SelectableId): id is LockedId => (LOCKED_IDS as string[]).includes(id);

export const CONTROL_META: Record<SelectableId, { label: string; short: string; hint: string }> = {
  gestureClick: { label: "Botão de gestos — clique", short: "Clique", hint: "Pressione e solte o botão atrás da roda, sem mover o mouse." },
  gestureUp: { label: "Gesto para cima", short: "Cima", hint: "Segure o botão de gestos e mova o mouse para cima." },
  gestureDown: { label: "Gesto para baixo", short: "Baixo", hint: "Segure o botão de gestos e mova o mouse para baixo." },
  gestureLeft: { label: "Gesto para a esquerda", short: "Esquerda", hint: "Segure o botão de gestos e mova o mouse para a esquerda." },
  gestureRight: { label: "Gesto para a direita", short: "Direita", hint: "Segure o botão de gestos e mova o mouse para a direita." },
  tiltLeft: { label: "Tilt para a esquerda", short: "Tilt ←", hint: "Incline a roda de rolagem para a esquerda." },
  tiltRight: { label: "Tilt para a direita", short: "Tilt →", hint: "Incline a roda de rolagem para a direita." },
  middleClick: { label: "Clique na roda", short: "Clique na roda", hint: "Pressione a roda de rolagem para baixo." },
  leftClick: { label: "Botão esquerdo", short: "Esquerdo", hint: "Clique principal." },
  rightClick: { label: "Botão direito", short: "Direito", hint: "Clique secundário (menu de contexto)." },
  scroll: { label: "Rolagem", short: "Rolagem", hint: "Gire a roda para cima ou para baixo." },
};

export const DEFAULT_BINDINGS: Record<ControlId, Action> = {
  gestureClick: { type: "system", action: "missionControl" },
  gestureUp: { type: "system", action: "missionControl" },
  gestureDown: { type: "system", action: "appExpose" },
  gestureLeft: { type: "system", action: "spaceLeft" },
  gestureRight: { type: "system", action: "spaceRight" },
  tiltLeft: { type: "system", action: "back" },
  tiltRight: { type: "system", action: "forward" },
  middleClick: { type: "default" },
};

export function defaultConfig(): Config {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    profiles: [{ id: "default", name: "Padrão", apps: [], bindings: structuredClone(DEFAULT_BINDINGS) }],
  };
}

export function defaultProfile(c: Config): Profile | undefined {
  return c.profiles.find((p) => p.id === "default") ?? c.profiles[0];
}

/** Ação efetiva de um controle num perfil (perfis de app herdam do Padrão). */
export function effectiveAction(c: Config, profileId: string, control: ControlId): { action: Action; inherited: boolean } {
  const p = c.profiles.find((x) => x.id === profileId);
  const own = p?.bindings[control];
  if (own) return { action: own, inherited: false };
  const d = defaultProfile(c)?.bindings[control] ?? DEFAULT_BINDINGS[control];
  return { action: d, inherited: p?.id !== "default" };
}

/** Uma ação está completa o suficiente para ser executada? */
export function isActionComplete(a: Action): boolean {
  switch (a.type) {
    case "system": return !!a.action;
    case "keystroke": return a.keyCode !== undefined;
    case "openApp": return !!(a.bundleId || a.path);
    case "openURL": return !!a.url?.trim();
    case "shell": return !!a.command?.trim();
    default: return true;
  }
}
