import { buildAdapterEnvConfig, type CreateConfigValues } from "@paperclipai/adapter-utils";
import {
  DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
  DEFAULT_OPENAI_COMPATIBLE_MODEL,
} from "../index.js";

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  return normalized.replace(/\/chat\/completions$/i, "");
}

export function buildOpenAICompatibleConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};

  if (v.url) ac.baseUrl = normalizeBaseUrl(v.url);
  if (v.authToken) ac.apiKey = v.authToken;

  const headers = parseJsonObject(v.headersJson ?? "");
  if (headers) ac.headers = headers;

  if (v.model) ac.model = v.model;
  if (v.promptTemplate) ac.promptTemplate = v.promptTemplate;
  if (v.timeoutSec != null && v.timeoutSec > 0) ac.timeoutSec = v.timeoutSec;

  const env = buildAdapterEnvConfig(v.envBindings, v.envVars);
  if (Object.keys(env).length > 0) ac.env = env;

  // Sensible defaults
  if (!ac.baseUrl) ac.baseUrl = DEFAULT_OPENAI_COMPATIBLE_BASE_URL;
  if (!ac.model) ac.model = DEFAULT_OPENAI_COMPATIBLE_MODEL;
  if (ac.timeoutSec == null) ac.timeoutSec = 300;
  if (!ac.apiKey && (ac as { apiKey?: unknown }).apiKey == null) {
    // Leave apiKey unset deliberately so local servers without auth work.
    delete ac.apiKey;
  }

  return ac;
}
