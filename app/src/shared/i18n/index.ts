// UI languages. Shared by the renderer (React) and the Electron main process (dialogs/errors).
import { en, type Messages } from "./en";
import { ptBR } from "./pt-BR";

export type { Messages };

export const LANGUAGES = ["en", "pt-BR"] as const;
export type Language = (typeof LANGUAGES)[number];

export const MESSAGES: Record<Language, Messages> = { en, "pt-BR": ptBR };

export function isLanguage(v: unknown): v is Language {
  return typeof v === "string" && (LANGUAGES as readonly string[]).includes(v);
}

/** Picks the best supported language for a system locale (e.g. "pt-BR", "pt_PT", "en-US"). */
export function languageFromLocale(locale: string | undefined): Language {
  return locale?.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}
