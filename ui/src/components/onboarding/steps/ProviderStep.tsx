import { FooterNav } from "../FooterNav";
import { OnboardingCard, OnboardingHeading, Stepper } from "../OnboardingPrimitives";
import { t } from "@/i18n";

export function ProviderStep({
  model,
  baseUrl,
  apiKey,
  onModelChange,
  onBaseUrlChange,
  onApiKeyChange,
  onBack,
  onNext,
  loading,
  step,
  total,
}: {
  model: string;
  baseUrl: string;
  apiKey: string;
  onModelChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
  loading?: boolean;
  step: number;
  total?: number;
}) {
  const validUrl = (() => {
    try {
      const url = new URL(baseUrl);
      return (url.protocol === "http:" || url.protocol === "https:") &&
        !url.pathname.endsWith("/chat/completions");
    } catch {
      return false;
    }
  })();
  const canContinue = model.trim().length > 0 && validUrl && baseUrl.trim().length > 0;

  return (
    <OnboardingCard>
      <Stepper step={step} total={total} />
      <div className="space-y-6">
        <OnboardingHeading
          title={t("onboarding.provider.title")}
          lede={t("onboarding.provider.description")}
          center
        />
        <div className="space-y-4">
          <label className="block space-y-1.5 text-sm">
            <span className="text-xs text-muted-foreground">{t("onboarding.provider.provider")}</span>
            <input className="w-full rounded-md border border-border bg-transparent px-3 py-2 outline-none" value="OpenAI-compatible" readOnly />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-xs text-muted-foreground">{t("onboarding.provider.model")}</span>
            <input className="w-full rounded-md border border-border bg-transparent px-3 py-2 outline-none" value={model} onChange={(event) => onModelChange(event.target.value)} placeholder="gpt-4o" />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-xs text-muted-foreground">{t("onboarding.provider.baseUrl")}</span>
            <input className="w-full rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm outline-none" value={baseUrl} onChange={(event) => onBaseUrlChange(event.target.value)} placeholder="https://api.openai.com/v1" />
            {!validUrl && baseUrl.trim() && <span className="text-xs text-destructive">{t("onboarding.provider.invalidUrl")}</span>}
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-xs text-muted-foreground">{t("onboarding.provider.apiKey")} <span className="text-muted-foreground">({t("onboarding.provider.localKeyHint")})</span></span>
            <input className="w-full rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm outline-none" type="password" value={apiKey} onChange={(event) => onApiKeyChange(event.target.value)} placeholder="sk-..." autoComplete="new-password" />
          </label>
        </div>
        <FooterNav
          onBack={onBack}
          primaryLabel={t("onboarding.provider.createCeo")}
          primaryDisabled={!canContinue}
          loading={loading}
          loadingLabel={t("onboarding.provider.connecting")}
          onPrimary={onNext}
        />
      </div>
    </OnboardingCard>
  );
}
