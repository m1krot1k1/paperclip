// Cloud onboarding flow — the thin container that owns state + backend wiring
// and composes the shared step views inside the shared OnboardingScaffold.
// Advances Start → Company → Agent → Task, then launches the first task and
// opens the dashboard. The local flow (LocalOnboardingFlow) reuses the same
// shared steps + shell and inserts its extra steps.
import { useState } from "react";
import { useNavigate } from "@/lib/router";
import { useOnboardingFlow } from "@/hooks/useOnboardingFlow";
import { firstTaskPayload, ROLE_ACRONYMS, type FirstTaskChoice } from "./onboarding-data";
import { OnboardingScaffold } from "./OnboardingScaffold";
import { StartStep } from "./steps/StartStep";
import { CompanyStep } from "./steps/CompanyStep";
import { AgentStep } from "./steps/AgentStep";
import { ProviderStep } from "./steps/ProviderStep";
import { TaskStep } from "./steps/TaskStep";
import { CodebaseStep } from "./steps/CodebaseStep";
import type { OnboardingCodebase } from "@/lib/onboarding-launch";

type Step = "start" | "company" | "codebase" | "agent" | "provider" | "task";

const DEFAULT_ADAPTER = "openai_compatible";

// Numbered steps drive the Stepper position ("Step N of M").
const NUMBERED: Step[] = ["company", "codebase", "agent", "provider", "task"];
function stepper(s: Step) {
  return { step: NUMBERED.indexOf(s) + 1, total: NUMBERED.length };
}

export interface CloudOnboardingFlowProps {
  /** Called when the user dismisses onboarding. */
  onClose?: () => void;
  /** Starting step. Defaults to "start". Used by the standalone preview harness. */
  initialStep?: Step;
  /**
   * Preview-only: skip all backend calls (company/agent/task creation) so the
   * flow can be clicked end-to-end without a backend. Used by the standalone
   * preview harness — never enabled in the real app.
   */
  previewMock?: boolean;
  /**
   * When set, onboarding runs against an already-created company (the "add an
   * agent to an existing company" entry): company creation is skipped and the
   * flow starts at the agent step.
   */
  existingCompany?: { id: string; prefix: string | null };
}

export function CloudOnboardingFlow({
  onClose,
  initialStep = "start",
  previewMock = false,
  existingCompany,
}: CloudOnboardingFlowProps) {
  const navigate = useNavigate();
  const flow = useOnboardingFlow(
    existingCompany
      ? { createdCompanyId: existingCompany.id, createdCompanyPrefix: existingCompany.prefix }
      : undefined,
  );

  const [step, setStep] = useState<Step>(initialStep);
  const [companyName, setCompanyName] = useState("");
  const [mission, setMission] = useState("");
  const [codebase, setCodebase] = useState<OnboardingCodebase | null>(null);
  const [agentRole, setAgentRole] = useState("");
  const [agentName, setAgentName] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [taskChoice, setTaskChoice] = useState<FirstTaskChoice | null>(null);
  const [customTask, setCustomTask] = useState("");

  function handleRoleChange(value: string) {
    setAgentRole(value);
    setAgentName(value in ROLE_ACRONYMS ? ROLE_ACRONYMS[value] : "");
  }

  async function handleCreateCompany() {
    if (previewMock) {
      setStep("codebase");
      return;
    }
    const result = await flow.createCompanyAndGoal({ companyName, companyGoal: mission });
    if (result) setStep("codebase");
  }

  async function handleCreateAgent() {
    if (previewMock) {
      setStep("task");
      return;
    }
    const result = await flow.hireLeadAgent({
      agentName: agentName || agentRole,
      adapter: { adapterType: DEFAULT_ADAPTER, model, command: "", args: "", url: baseUrl, authToken: apiKey },
      instructions: {
        companyName,
        companyGoal: mission,
        growPath: false,
        growWorkflows: "",
        growPainPoints: "",
        growAutomate: "",
        q1: "",
        q2: "",
        q3: "",
        q4: "",
      },
      // The cloud agent step has no environment probe; keep hire simple.
      requireEnvProbe: false,
    });
    if (result) setStep("task");
  }

  async function handleGetStarted() {
    if (!taskChoice) return;
    if (previewMock) {
      window.alert(
        "Preview complete — in the real app this launches the first task and opens your dashboard.",
      );
      return;
    }
    const result = await flow.launchFirstTask({
      ...firstTaskPayload(taskChoice, customTask),
      codebase: codebase ?? undefined,
    });
    if (result) {
      onClose?.();
      navigate(result.companyPrefix ? `/${result.companyPrefix}/dashboard` : "/dashboard");
    }
  }

  return (
    <OnboardingScaffold stepKey={step} onClose={onClose}>
      {step === "start" && <StartStep onSetup={() => setStep("company")} />}
      {step === "company" && (
        <CompanyStep
          {...stepper("company")}
          companyName={companyName}
          onCompanyNameChange={setCompanyName}
          mission={mission}
          onMissionChange={setMission}
          onBack={() => setStep("start")}
          onNext={handleCreateCompany}
          loading={flow.loading}
        />
      )}
      {step === "codebase" && (
        <CodebaseStep
          {...stepper("codebase")}
          codebase={codebase ?? { sourceType: "local_path", cwd: "" }}
          onCodebaseChange={setCodebase}
          onBack={() => setStep("company")}
          onNext={() => setStep("agent")}
          loading={flow.loading}
        />
      )}
      {step === "agent" && (
        <AgentStep
          {...stepper("agent")}
          agentRole={agentRole}
          agentName={agentName}
          onRoleChange={handleRoleChange}
          onNameChange={setAgentName}
          onBack={existingCompany ? () => onClose?.() : () => setStep("company")}
          onNext={() => setStep("provider")}
          loading={flow.loading}
        />
      )}
      {step === "provider" && (
        <ProviderStep
          {...stepper("provider")}
          model={model}
          baseUrl={baseUrl}
          apiKey={apiKey}
          onModelChange={setModel}
          onBaseUrlChange={setBaseUrl}
          onApiKeyChange={setApiKey}
          onBack={() => setStep("agent")}
          onNext={handleCreateAgent}
          loading={flow.loading}
        />
      )}
      {step === "task" && (
        <TaskStep
          {...stepper("task")}
          agentName={agentName}
          agentRole={agentRole}
          taskChoice={taskChoice}
          onSelectChoice={setTaskChoice}
          customTask={customTask}
          onCustomTaskChange={setCustomTask}
          onBack={() => setStep("provider")}
          onGetStarted={handleGetStarted}
          loading={flow.loading}
          error={flow.error}
        />
      )}
    </OnboardingScaffold>
  );
}
