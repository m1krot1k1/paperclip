import type { UsageSummary } from "@paperclipai/adapter-utils";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function parseOpenAICompatibleUsage(value: unknown): UsageSummary | undefined {
  const usage = asRecord(value);
  if (!usage) return undefined;

  const inputTokens = asNumber(usage.prompt_tokens);
  const outputTokens = asNumber(usage.completion_tokens);
  const cachedInputTokens =
    asNumber(usage.prompt_tokens_details?.cached_tokens) ??
    asNumber(usage.cached_tokens);

  if (inputTokens <= 0 && outputTokens <= 0 && cachedInputTokens <= 0) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    ...(cachedInputTokens > 0 ? { cachedInputTokens } : {}),
  };
}

export function isOpenAICompatibleErrorShape(value: unknown): boolean {
  const record = asRecord(value);
  return Boolean(record && (typeof record.error === "object" || typeof record.error === "string"));
}

export function parseOpenAICompatibleErrorMessage(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;
  const error = record.error;
  if (typeof error === "string" && error.trim().length > 0) return error.trim();
  const errorRecord = asRecord(error);
  if (errorRecord) {
    const message = asString(errorRecord.message).trim();
    if (message.length > 0) return message;
    const code = asString(errorRecord.code).trim();
    if (code.length > 0) return code;
  }
  return null;
}

export function extractOpenAICompatibleSummary(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;
  for (const candidate of ["summary", "text", "content"]) {
    const text = asString(record[candidate]).trim();
    if (text.length > 0) return text;
  }
  return null;
}
