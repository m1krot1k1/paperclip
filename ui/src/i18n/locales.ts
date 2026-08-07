import type { Resource } from "i18next";

import { assertSafeLocaleMessages, assertValidLocaleMessages } from "./locale-validation";

export const DEFAULT_LOCALE = "en" as const;

const localeModules = import.meta.glob("./locales/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

export const localeMessages = Object.fromEntries(
  Object.entries(localeModules).map(([path, messages]) => {
    const locale = path.match(/\/([A-Za-z0-9_-]+)\.json$/)?.[1];
    if (!locale) {
      throw new Error(`Invalid locale file path: ${path}`);
    }
    return [locale, messages];
  }),
);

if (!(DEFAULT_LOCALE in localeMessages)) {
  throw new Error(`Missing default locale messages for ${DEFAULT_LOCALE}`);
}

for (const [locale, messages] of Object.entries(localeMessages)) {
  try {
    // The default locale must be a complete, self-consistent message set.
    // All other locales are optional partial translations: they may omit keys
    // (falling back to English via i18next), but every key they DO define must
    // mirror the English shape exactly and pass the same injection-safety and
    // length checks. This lets us add a rich Russian translation without
    // forcing ~40 community locales to stay in lock-step.
    if (locale === DEFAULT_LOCALE) {
      assertValidLocaleMessages(messages);
    } else {
      assertSafeLocaleMessages(messages);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${locale} locale messages: ${message}`);
  }
}

export const supportedLocales = Object.keys(localeMessages);

export const i18nextResources: Resource = Object.fromEntries(
  Object.entries(localeMessages).map(([locale, messages]) => [locale, { translation: messages }]),
) as Resource;

export type SupportedLocale = keyof typeof localeMessages;

/**
 * Storage keys + helpers for the user's locale preference.
 *
 * The selected locale is persisted client-side only (localStorage). Paperclip
 * does not yet persist UI language on the server, so this is intentionally a
 * per-browser preference. Language selection is a display concern and is not a
 * control-plane invariant; keeping it out of the API/DB avoids cross-user
 * leakage and keeps the change small and reversible.
 */
export const LOCALE_STORAGE_KEY = "paperclip.ui.locale";

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return Boolean(value && value in localeMessages);
}
