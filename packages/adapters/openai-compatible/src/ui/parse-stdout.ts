import type { TranscriptEntry } from "@paperclipai/adapter-utils";

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Parse an OpenAI-compatible adapter log line into transcript entries for the
 * run viewer. Recognizes the `[openai-compatible]` prefixed lines the
 * execute() path writes, and falls back to raw stdout for everything else.
 */
export function parseOpenAICompatibleStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const trimmed = line.replace(/\n$/, "");
  if (!trimmed.trim()) return [];

  const prefixMatch = trimmed.match(/^\[openai-compatible\]\s*(.*)$/);
  if (!prefixMatch) return [{ kind: "stdout", ts, text: trimmed }];

  const body = prefixMatch[1] ?? "";
  if (body.startsWith("request failed") || body.startsWith("error") || body.startsWith("transient retry")) {
    return [{ kind: "stderr", ts, text: body }];
  }
  if (body.startsWith("completion ")) {
    return [{ kind: "result", ts, text: body, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, subtype: "completion", isError: false, errors: [] }];
  }
  if (body.startsWith("invoking ")) {
    return [{ kind: "system", ts, text: body }];
  }

  // Attempt to surface structured content when the line carries raw JSON.
  const parsed = safeJsonParse(body);
  const record = asRecord(parsed);
  if (record) {
    const content = asString(record.content).trim();
    if (content) {
      return [{ kind: "assistant", ts, text: content }];
    }
  }

  return [{ kind: "system", ts, text: body }];
}
