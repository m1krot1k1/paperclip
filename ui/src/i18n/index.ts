import i18n, { type InitOptions, type TOptions } from "i18next";
import { initReactI18next, useTranslation as useReactI18nextTranslation } from "react-i18next";

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  i18nextResources,
  isSupportedLocale,
  supportedLocales,
  type SupportedLocale,
} from "./locales";

function getNavigatorLocale(): string | null {
  if (typeof navigator === "undefined") return null;
  const raw = navigator.language ?? navigator.languages?.[0] ?? null;
  if (!raw) return null;
  const primary = raw.split("-")[0];
  return isSupportedLocale(primary) ? primary : null;
}

function getStoredLocale(): SupportedLocale | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isSupportedLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function resolveInitialLocale(): SupportedLocale {
  return getStoredLocale() ?? getNavigatorLocale() ?? DEFAULT_LOCALE;
}

const i18nextOptions: InitOptions = {
  resources: i18nextResources,
  lng: resolveInitialLocale(),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: supportedLocales,
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnObjects: false,
  initAsync: false,
};

void i18n.use(initReactI18next).init(i18nextOptions).catch((error: unknown) => {
  console.error("Failed to initialize i18next", error);
});

export function t(key: string, options: TOptions = {}) {
  return i18n.t(key, options);
}

/**
 * Switch the active UI locale, persisting the choice to localStorage so it
 * survives reloads and is shared across the whole board app.
 */
export function setLocale(locale: SupportedLocale): void {
  i18n.changeLanguage(locale);
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Persistence is best-effort; an enabled/private-storage browser still gets
    // the in-memory language change for the current session.
  }
}

export { DEFAULT_LOCALE, isSupportedLocale, supportedLocales };
export type { SupportedLocale };
export const useTranslation = useReactI18nextTranslation;
export { i18n };
