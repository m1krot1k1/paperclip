import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MISSION_CHIPS } from "../onboarding-data";
import { Chip, OnboardingCard, OnboardingHeading, Stepper } from "../OnboardingPrimitives";
import { FooterNav } from "../FooterNav";
import { t } from "@/i18n";

/** Company name + mission step. */
export function CompanyStep({
  companyName,
  onCompanyNameChange,
  mission,
  onMissionChange,
  onBack,
  onNext,
  loading,
  error,
  step,
  total,
}: {
  companyName: string;
  onCompanyNameChange: (value: string) => void;
  mission: string;
  onMissionChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
  loading?: boolean;
  error?: string | null;
  step: number;
  total?: number;
}) {
  const [activeChip, setActiveChip] = useState<string | null>(null);
  return (
    <OnboardingCard>
      <Stepper step={step} total={total} />
      <div className="space-y-6">
        <OnboardingHeading
          title={t("onboarding.company.title")}
          lede={t("onboarding.company.description")}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="onboarding-company-name">{t("onboarding.company.name")}</Label>
          <Input
            id="onboarding-company-name"
            placeholder={t("onboarding.company.namePlaceholder")}
            value={companyName}
            onChange={(e) => onCompanyNameChange(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="onboarding-mission">{t("onboarding.company.mission")}</Label>
          <Textarea
            id="onboarding-mission"
            className="min-h-(--sz-88px)"
            placeholder={t("onboarding.company.missionPlaceholder")}
            value={mission}
            onChange={(e) => {
              onMissionChange(e.target.value);
              setActiveChip(null);
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {MISSION_CHIPS.map((chip) => (
            <Chip
              key={chip}
              label={chip}
              active={activeChip === chip}
              onClick={() => {
                onMissionChange(chip);
                setActiveChip(chip);
              }}
            />
          ))}
        </div>
        <FooterNav
          onBack={onBack}
          primaryLabel={t("common.next")}
          primaryDisabled={!companyName.trim() || !mission.trim()}
          loading={loading}
          loadingLabel={t("onboarding.agent.creating")}
          onPrimary={onNext}
        />
        {error && !loading ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
      </div>
    </OnboardingCard>
  );
}
