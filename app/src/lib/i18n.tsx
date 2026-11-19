import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isLanguage, languageFromLocale, MESSAGES, type Language, type Messages } from "../shared/i18n";
import { api } from "./api";

const STORAGE_KEY = "language";

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch { /* no storage */ }
  return languageFromLocale(navigator.language);
}

interface I18n { lang: Language; t: Messages; setLang: (l: Language) => void }

const I18nContext = createContext<I18n | null>(null);

// Tell the main process right away: child effects (e.g. the first config:load) run before the provider's.
const startLanguage = initialLanguage();
void api.setLanguage(startLanguage);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(startLanguage);

  // Keeps <html lang> and the main process (native dialogs, error messages) in sync.
  useEffect(() => {
    document.documentElement.lang = lang;
    void api.setLanguage(lang);
  }, [lang]);

  const setLang = useCallback((l: Language) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* no storage */ }
  }, []);

  const value = useMemo(() => ({ lang, t: MESSAGES[lang], setLang }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** Shortcut for components that only need the strings. */
export const useT = () => useI18n().t;
