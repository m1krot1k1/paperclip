import { useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  setLocale,
  useTranslation,
  supportedLocales,
  isSupportedLocale,
  type SupportedLocale,
} from "@/i18n";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function localeEndonym(locale: SupportedLocale): string {
  // Shortlist of the most common locales with display names in their own
  // language; anything else falls back to its locale code.
  const labelled: Partial<Record<SupportedLocale, string>> = {
    en: "English",
    ru: "Русский",
    de: "Deutsch",
    fr: "Français",
    es: "Español",
    zh: "中文",
    ja: "日本語",
    ko: "한국어",
  };
  return labelled[locale] ?? locale;
}

/**
 * Dashboard language switcher.
 *
 * Rendered in the account menu as a menu-action row. Selecting a locale
 * switches the whole board UI immediately (via i18next) and persists the
 * choice to localStorage. Only the default + explicitly translated locales
 * (Russian today) localize the UI; the rest fall back to English.
 */
export function LanguageSwitcher({
  onAfterSelect,
  className,
}: {
  onAfterSelect?: () => void;
  className?: string;
}) {
  const { i18n: i18nInstance, t } = useTranslation();
  const current = isSupportedLocale(i18nInstance.language) ? i18nInstance.language : ("en" as const);
  const [open, setOpen] = useState(false);

  const selectable = (supportedLocales as SupportedLocale[]).filter(
    (locale) => locale !== current,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent/60",
            className,
          )}
          aria-label={t("account.menuAriaLabel")}
        >
          <span className="mt-0.5 rounded-lg border border-border bg-background/70 p-2 text-muted-foreground">
            <Languages className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">{t("account.language")}</span>
            <span className="block flex items-center gap-1 text-xs text-muted-foreground">
              <ChevronDown className="size-3" />
              {localeEndonym(current)}
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" sideOffset={6} className="w-(--sz-200px) p-1">
        <div className="max-h-(--sz-calc-18) overflow-y-auto">
          <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("language.label")}
          </div>
          {selectable.map((locale) => (
            <button
              key={locale}
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
              onClick={() => {
                setLocale(locale);
                setOpen(false);
                onAfterSelect?.();
              }}
            >
              <span className="truncate">{localeEndonym(locale)}</span>
              {locale === current ? <Check className="size-4 text-foreground" /> : null}
            </button>
          ))}
          {selectable.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">{localeEndonym(current)}</div>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-start text-xs text-muted-foreground"
            onClick={() => {
              setLocale("en");
              setOpen(false);
              onAfterSelect?.();
            }}
          >
            {t("language.resetToEnglish")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
