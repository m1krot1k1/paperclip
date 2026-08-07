import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  DraftInput,
  help,
} from "../../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

function SecretField({
  label,
  value,
  onCommit,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <DraftInput
          value={value}
          onCommit={onCommit}
          immediate
          type={visible ? "text" : "password"}
          className={inputClass + " pl-8"}
          placeholder={placeholder}
        />
      </div>
    </Field>
  );
}

function HeadersJsonTextarea({
  isCreate,
  createDraft,
  onCreateDraftChange,
  editStringified,
  onEditCommit,
}: {
  isCreate: boolean;
  createDraft: string;
  onCreateDraftChange: (next: string) => void;
  editStringified: string;
  onEditCommit: (next: string) => void;
}) {
  const [editDraft, setEditDraft] = useState<string>(editStringified);
  const [lastSyncedFromConfig, setLastSyncedFromConfig] = useState<string>(editStringified);
  if (!isCreate && editStringified !== lastSyncedFromConfig) {
    setEditDraft(editStringified);
    setLastSyncedFromConfig(editStringified);
  }
  const value = isCreate ? createDraft : editDraft;
  return (
    <textarea
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        if (isCreate) {
          onCreateDraftChange(next);
        } else {
          setEditDraft(next);
          onEditCommit(next);
        }
      }}
      rows={3}
      className={inputClass}
      placeholder='{"x-custom-header": "value"}'
    />
  );
}

export function OpenAICompatibleConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  const configuredHeaders =
    config.headers && typeof config.headers === "object" && !Array.isArray(config.headers)
      ? (config.headers as Record<string, unknown>)
      : {};

  return (
    <>
      <Field label="Base URL" hint={help.baseUrl}>
        <DraftInput
          value={
            isCreate
              ? values!.url
              : eff("adapterConfig", "baseUrl", String(config.baseUrl ?? ""))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ url: v })
              : mark("adapterConfig", "baseUrl", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="https://api.openai.com/v1"
        />
      </Field>

      <SecretField
        label="API key"
        value={
          isCreate
            ? values!.authToken ?? ""
            : eff("adapterConfig", "apiKey", String(config.apiKey ?? ""))
        }
        onCommit={(v) =>
          isCreate
            ? set!({ authToken: v })
            : mark("adapterConfig", "apiKey", v || undefined)
        }
        placeholder="sk-..."
      />

      <Field label="Model">
        <DraftInput
          value={
            isCreate
              ? values!.model ?? ""
              : eff("adapterConfig", "model", String(config.model ?? ""))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ model: v })
              : mark("adapterConfig", "model", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="gpt-4o"
        />
      </Field>

      <Field label="Prompt template">
        <DraftInput
          value={
            isCreate
              ? values!.promptTemplate ?? ""
              : eff("adapterConfig", "promptTemplate", String(config.promptTemplate ?? ""))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ promptTemplate: v })
              : mark("adapterConfig", "promptTemplate", v || undefined)
          }
          className={inputClass}
          placeholder="Optional prompt template"
        />
      </Field>

      <Field label="Timeout (seconds)">
        <DraftInput
          value={
            isCreate
              ? values!.timeoutSec != null ? String(values!.timeoutSec) : ""
              : eff("adapterConfig", "timeoutSec", String(config.timeoutSec ?? ""))
          }
          onCommit={(v) => {
            const parsed = Number.parseInt(v.trim(), 10);
            const val = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
            if (isCreate) {
              set!({ timeoutSec: val });
            } else {
              mark("adapterConfig", "timeoutSec", val);
            }
          }}
          immediate
          className={inputClass}
          placeholder="300"
        />
      </Field>

      <Field label="Headers JSON">
        <HeadersJsonTextarea
          isCreate={isCreate}
          createDraft={isCreate ? values!.headersJson ?? "" : ""}
          onCreateDraftChange={(next) => set!({ headersJson: next })}
          editStringified={JSON.stringify(eff("adapterConfig", "headers", configuredHeaders), null, 2)}
          onEditCommit={(next) => {
            const trimmed = next.trim();
            if (!trimmed) {
              mark("adapterConfig", "headers", undefined);
              return;
            }
            try {
              const parsed = JSON.parse(trimmed);
              if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                mark("adapterConfig", "headers", parsed);
              }
            } catch {
              // Keep local draft until JSON is valid
            }
          }}
        />
      </Field>
    </>
  );
}
