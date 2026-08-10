import { motion } from "motion/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AgentCapsule } from "../../AgentCapsule";
import { ROLE_OPTIONS } from "../onboarding-data";
import { OnboardingCard, OnboardingHeading, Stepper } from "../OnboardingPrimitives";
import { FooterNav } from "../FooterNav";
import { AgentPreview } from "../AgentPreview";
import { capsuleHandoffExit, capsuleMotion } from "../onboarding-motion";
import { t } from "@/i18n";

/** Create-your-first-agent step: role select + optional name, with the capsule. */
export function AgentStep({
  agentRole,
  agentName,
  onRoleChange,
  onNameChange,
  onBack,
  onNext,
  loading,
  step,
  total,
  primaryLabel = t("onboarding.agent.create"),
  loadingLabel = t("onboarding.agent.creating"),
}: {
  agentRole: string;
  agentName: string;
  onRoleChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
  loading?: boolean;
  step: number;
  total?: number;
  /** CTA label — cloud hires here ("Create"); local advances to the adapter step ("Next"). */
  primaryLabel?: string;
  loadingLabel?: string;
}) {
  const previewVisible = Boolean(agentName || agentRole);
  return (
    <OnboardingCard>
      <Stepper step={step} total={total} />
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-2">
          <motion.div {...capsuleMotion} exit={capsuleHandoffExit}>
            <AgentCapsule
              state={previewVisible ? "configured" : "slot"}
              strokeDraw
              gradient={5}
              glow="blue"
              size="md"
            />
          </motion.div>
          <AgentPreview agentName={agentName} agentRole={agentRole} />
        </div>
        <OnboardingHeading title={t("onboarding.agent.title")} center />
        <div className="mx-auto flex w-full max-w-(--sz-320px) flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="onboarding-agent-role">{t("onboarding.agent.role")}</Label>
            <Select value={agentRole || undefined} onValueChange={onRoleChange}>
              <SelectTrigger id="onboarding-agent-role" className="w-full">
                <SelectValue placeholder={t("onboarding.agent.rolePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`onboarding.roles.${r === "Chief of Staff" ? "chiefOfStaff" : r === "Chief Technical Officer" ? "chiefTechnicalOfficer" : r === "Head of Marketing" ? "headOfMarketing" : r.toLowerCase()}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="onboarding-agent-name">
              {t("onboarding.agent.name")} <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
            </Label>
            <Input
              id="onboarding-agent-name"
              placeholder={t("onboarding.agent.namePlaceholder")}
              value={agentName}
              onChange={(e) => onNameChange(e.target.value)}
            />
          </div>
        </div>
        <FooterNav
          onBack={onBack}
          primaryLabel={primaryLabel}
          primaryDisabled={!agentRole.trim()}
          loading={loading}
          loadingLabel={loadingLabel}
          onPrimary={onNext}
        />
      </div>
    </OnboardingCard>
  );
}
