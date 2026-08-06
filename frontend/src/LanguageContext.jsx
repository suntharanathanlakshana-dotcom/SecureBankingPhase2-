import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { translate, LANGUAGES } from "./i18n/translations";
import { useAuth } from "./AuthContext.jsx";
import { api } from "./api";

const LanguageContext = createContext(null);
const STORAGE_KEY = "sb_language";

function getInitialLanguage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return LANGUAGES.some((l) => l.code === saved) ? saved : "en";
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getInitialLanguage);
  const { user } = useAuth();

  // Once the signed-in user's saved preference loads, prefer it over the local guess
  // (covers logging in on a new device where localStorage has no prior choice).
  useEffect(() => {
    if (user?.language && LANGUAGES.some((l) => l.code === user.language)) {
      setLanguageState(user.language);
    }
  }, [user?.language]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.setAttribute("lang", language);
  }, [language]);

  const setLanguage = useCallback(async (code) => {
    setLanguageState(code);
    if (user) {
      try {
        await api.post("/auth/language", { language: code });
      } catch {
        // Non-fatal — the UI still switches language locally even if persisting fails.
      }
    }
  }, [user]);

  const t = useCallback((key) => translate(language, key), [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, languages: LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
