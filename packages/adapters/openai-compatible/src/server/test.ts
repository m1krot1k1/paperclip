import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import {
  DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
} from "../index.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const baseUrlValue = asString(config.baseUrl, DEFAULT_OPENAI_COMPATIBLE_BASE_URL).trim();

  if (!baseUrlValue) {
    checks.push({
      code: "openai_compatible_base_url_missing",
      level: "error",
      message: "OpenAI-compatible adapter requires a base URL.",
      hint: "Set adapterConfig.baseUrl, e.g. https://api.openai.com/v1 or http://localhost:11434/v1.",
    });
    return {
      adapterType: ctx.adapterType,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  const baseUrl = normalizeBaseUrl(baseUrlValue);
  let url: URL | null = null;
  try {
    url = new URL(`${baseUrl}/chat/completions`);
  } catch {
    checks.push({
      code: "openai_compatible_base_url_invalid",
      level: "error",
      message: `Invalid base URL: ${baseUrlValue}`,
    });
  }

  if (url) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      checks.push({
        code: "openai_compatible_base_url_protocol_invalid",
        level: "error",
        message: `Unsupported URL protocol: ${url.protocol}`,
        hint: "Use http:// or https://.",
      });
    } else {
      checks.push({
        code: "openai_compatible_base_url_valid",
        level: "info",
        message: `Configured endpoint: ${url.toString()}`,
      });
    }
  }

  const apiKey = nonEmpty(config.apiKey) ?? nonEmpty(config.token);
  const headers = parseObject(config.headers);
  const authHeader =
    headers && Object.entries(headers as Record<string, unknown>).some(
      ([key]) => key.toLowerCase() === "authorization",
    );

  if (apiKey || authHeader) {
    checks.push({
      code: "openai_compatible_auth_present",
      level: "info",
      message: "Endpoint credentials are configured.",
    });
  } else {
    checks.push({
      code: "openai_compatible_auth_missing",
      level: "warn",
      message: "No API key detected in adapter config.",
      hint: "Most hosted providers require apiKey; local servers (Ollama, vLLM) may not.",
    });
  }

  const model = asString(config.model, "").trim();
  if (model) {
    checks.push({
      code: "openai_compatible_model_set",
      level: "info",
      message: `Configured model: ${model}`,
    });
  } else {
    checks.push({
      code: "openai_compatible_model_default",
      level: "warn",
      message: "No model configured; the adapter default will be used.",
      hint: "Set adapterConfig.model to your provider's model id if the default is not available.",
    });
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
