import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FooterNav } from "../FooterNav";
import { OnboardingCard, OnboardingHeading, Stepper } from "../OnboardingPrimitives";
import { t } from "@/i18n";
import type { OnboardingCodebase } from "@/lib/onboarding-launch";

export function CodebaseStep({
  codebase,
  onCodebaseChange,
  onBack,
  onNext,
  loading,
  step,
  total,
}: {
  codebase: OnboardingCodebase;
  onCodebaseChange: (value: OnboardingCodebase) => void;
  onBack: () => void;
  onNext: () => void;
  loading?: boolean;
  step: number;
  total?: number;
}) {
  const [mode, setMode] = useState<"local_path" | "git_repo">(codebase.sourceType);
  const localPath = codebase.sourceType === "local_path" ? codebase.cwd : "";
  const repoUrl = codebase.sourceType === "git_repo" ? codebase.repoUrl : "";
  const repoRef = codebase.sourceType === "git_repo" ? codebase.repoRef ?? "" : "";

  const validLocalPath = localPath.startsWith("/") && localPath.trim().length > 1;
  let validRepoUrl = false;
  try {
    const url = new URL(repoUrl);
    validRepoUrl =
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      url.hostname === "github.com" &&
      url.pathname.split("/").filter(Boolean).length >= 2;
  } catch {
    validRepoUrl = false;
  }
  const valid = mode === "local_path" ? validLocalPath : validRepoUrl;

  function changeMode(next: "local_path" | "git_repo") {
    setMode(next);
    onCodebaseChange(next === "local_path" ? { sourceType: next, cwd: "" } : { sourceType: next, repoUrl: "" });
  }

  return (
    <OnboardingCard>
      <Stepper step={step} total={total} />
      <div className="space-y-6">
        <OnboardingHeading
          title={t("onboarding.codebase.title")}
          lede={t("onboarding.codebase.description")}
        />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={mode === "local_path" ? "rounded-md border border-foreground bg-accent px-3 py-2 text-sm" : "rounded-md border border-border px-3 py-2 text-sm"} onClick={() => changeMode("local_path")}>
            {t("onboarding.codebase.localFolder")}
          </button>
          <button type="button" className={mode === "git_repo" ? "rounded-md border border-foreground bg-accent px-3 py-2 text-sm" : "rounded-md border border-border px-3 py-2 text-sm"} onClick={() => changeMode("git_repo")}>
            {t("onboarding.codebase.gitRepository")}
          </button>
        </div>
        {mode === "local_path" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="onboarding-codebase-path">{t("onboarding.codebase.pathLabel")}</Label>
            <Input
              id="onboarding-codebase-path"
              placeholder="/Users/you/project"
              value={localPath}
              onChange={(event) => onCodebaseChange({ sourceType: "local_path", cwd: event.target.value })}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">{t("onboarding.codebase.pathHint")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="onboarding-codebase-repo">{t("onboarding.codebase.repoLabel")}</Label>
              <Input
                id="onboarding-codebase-repo"
                placeholder="https://github.com/org/repository"
                value={repoUrl}
                onChange={(event) => onCodebaseChange({ sourceType: "git_repo", repoUrl: event.target.value, repoRef })}
                autoFocus
              />
              {repoUrl && !validRepoUrl ? <p className="text-xs text-destructive">{t("onboarding.codebase.invalidRepo")}</p> : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="onboarding-codebase-ref">{t("onboarding.codebase.refLabel")}</Label>
              <Input
                id="onboarding-codebase-ref"
                placeholder="main"
                value={repoRef}
                onChange={(event) => onCodebaseChange({ sourceType: "git_repo", repoUrl, repoRef: event.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("onboarding.codebase.privateHint")}</p>
          </div>
        )}
        <FooterNav
          onBack={onBack}
          primaryLabel={t("common.next")}
          primaryDisabled={!valid}
          loading={loading}
          loadingLabel={t("common.loading")}
          onPrimary={onNext}
        />
      </div>
    </OnboardingCard>
  );
}
