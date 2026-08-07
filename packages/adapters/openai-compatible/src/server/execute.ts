import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  UsageSummary,
} from "@paperclipai/adapter-utils";
import {
  asNumber,
  asString,
  buildInvocationEnvForLogs,
  buildPaperclipEnv,
  parseJson,
  parseObject,
  renderPaperclipWakePrompt,
  renderTemplate,
  stringifyPaperclipWakePayload,
} from "@paperclipai/adapter-utils/server-utils";
import {
  DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
  DEFAULT_OPENAI_COMPATIBLE_MODEL,
} from "../index.js";
import {
  parseOpenAICompatibleErrorMessage,
  parseOpenAICompatibleUsage,
} from "./parse.js";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CompletionOutput {
  content: string;
  model: string | null;
  usage: UsageSummary | undefined;
  timedOut: boolean;
  failureMessage: string | null;
}

const HISTORY_WINDOW = 40;

function asStringRecord(value: unknown): Record<string, string> {
  const record = parseObject(value);
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function toChatMessage(entry: unknown): ChatMessage | null {
  const record = parseObject(entry);
  if (!record) return null;
  const role = record.role;
  if (role !== "system" && role !== "user" && role !== "assistant") return null;
  const content = asString(record.content, "").trim();
  if (!content) return null;
  return { role, content };
}

function readHistory(ctx: AdapterExecutionContext): ChatMessage[] {
  const sessionParams = parseObject(ctx.runtime.sessionParams);
  const rawHistory = sessionParams.history;
  if (!Array.isArray(rawHistory)) return [];
  const messages: ChatMessage[] = [];
  for (const entry of rawHistory) {
    const message = toChatMessage(entry);
    if (message) messages.push(message);
  }
  return messages.slice(-HISTORY_WINDOW);
}

function buildContextMessage(ctx: AdapterExecutionContext): string {
  const { runId, agent, context } = ctx;
  const wakePayloadJson = stringifyPaperclipWakePayload(context.paperclipWake);
  const wakePrompt = renderPaperclipWakePrompt(context.paperclipWake, {
    includeExecutionContract: true,
  });
  const taskId =
    (typeof context.taskId === "string" && context.taskId.trim().length > 0 && context.taskId.trim()) ||
    (typeof context.issueId === "string" && context.issueId.trim().length > 0 && context.issueId.trim()) ||
    null;

  const pieces = [
    `You are "${agent.name}", an AI agent employee in a Paperclip-managed company (agent ID ${agent.id}, run ID ${runId}).`,
    `Paperclip API base: ${buildPaperclipEnv(agent).PAPERCLIP_API_URL ?? "<set PAPERCLIP_API_URL>"}`,
    taskId
      ? `Assigned task/issue: ${taskId}`
      : "No specific issue is assigned; pick work from the company queue.",
    "Use curl (available in your environment) to call the Paperclip API and report progress or completion.",
    "Use HTTP requests with Authorization: Bearer $PAPERCLIP_API_KEY when the environment provides it, and X-Paperclip-Run-Id on mutating calls.",
  ];
  if (wakePrompt) pieces.push("", wakePrompt);
  if (wakePayloadJson) pieces.push("", "Structured wake payload:", wakePayloadJson);
  return pieces.join("\n");
}

async function requestCompletion(args: {
  baseUrl: string;
  apiKey: string | null;
  headers: Record<string, string>;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number | null;
  timeoutSec: number;
  maxRetries: number;
  onStderr: (line: string) => Promise<void>;
}): Promise<CompletionOutput> {
  const { baseUrl, apiKey, headers, model, messages, temperature, maxTokens, timeoutSec, maxRetries, onStderr } = args;
  const url = `${baseUrl}/chat/completions`;
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
  };

  const requestHeaders: Record<string, string> = {
    "content-type": "application/json",
    ...headers,
  };
  if (apiKey && !Object.keys(requestHeaders).some((key) => key.toLowerCase() === "authorization")) {
    requestHeaders.authorization = `Bearer ${apiKey}`;
  }

  let lastError: string | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoffMs = Math.min(2000 * attempt, 10_000);
      await onStderr(`[openai-compatible] transient retry ${attempt}/${maxRetries} after ${backoffMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }

    const controller = new AbortController();
    const timer = timeoutSec > 0 ? setTimeout(() => controller.abort(), timeoutSec * 1000) : null;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const rawBody = await res.text();

      if (!res.ok) {
        const parsed = parseJson(rawBody);
        const messageError = parsed ? parseOpenAICompatibleErrorMessage(parsed) : null;
        lastError = messageError ?? `HTTP ${res.status}`;
        await onStderr(`[openai-compatible] request failed: ${lastError}`);
        if (res.status >= 500 || res.status === 429) continue;
        return { content: "", model: null, usage: undefined, timedOut: false, failureMessage: lastError };
      }

      const parsed = parseJson(rawBody);
      if (!parsed) {
        return { content: "", model: null, usage: undefined, timedOut: false, failureMessage: null };
      }

      const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
      const first = parseObject(choices[0]);
      const message = parseObject(first?.message);
      const content = asString(message?.content, "").trim();
      const usage = parseOpenAICompatibleUsage(parsed.usage);
      const returnedModel = typeof parsed.model === "string" && parsed.model.trim() ? parsed.model : null;

      const tokens = usage ? `${usage.inputTokens}+${usage.outputTokens}` : "unknown";
      await onStderr(`[openai-compatible] completion model=${returnedModel ?? model} tokens=${tokens}`);

      return { content, model: returnedModel, usage, timedOut: false, failureMessage: null };
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "AbortError";
      lastError =
        err instanceof Error
          ? timedOut
            ? `request timed out after ${timeoutSec}s`
            : err.message
          : String(err);
      await onStderr(`[openai-compatible] error: ${lastError}`);
      if (timedOut) {
        return { content: "", model: null, usage: undefined, timedOut: true, failureMessage: lastError };
      }
      if (attempt < maxRetries) continue;
      return { content: "", model: null, usage: undefined, timedOut: false, failureMessage: lastError };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return { content: "", model: null, usage: undefined, timedOut: false, failureMessage: lastError };
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { config, agent, runId, context, onLog, onMeta, authToken } = ctx;

  const baseUrl = normalizeBaseUrl(asString(config.baseUrl, DEFAULT_OPENAI_COMPATIBLE_BASE_URL));
  const apiKey = nonEmpty(config.apiKey) ?? nonEmpty(config.token);
  const headers = asStringRecord(config.headers);
  const model = asString(config.model, DEFAULT_OPENAI_COMPATIBLE_MODEL).trim() || DEFAULT_OPENAI_COMPATIBLE_MODEL;
  const timeoutSec = asNumber(config.timeoutSec, 300);
  const maxRetries = asNumber(config.maxRetries, 2);
  const temperature = asNumber(config.temperature, 0.2);
  const maxTokensValue = asNumber(config.maxTokens, 0);
  const maxTokens = maxTokensValue > 0 ? maxTokensValue : null;

  const promptTemplate = asString(config.promptTemplate, "");
  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  };
  const renderedPrompt = promptTemplate.trim() ? renderTemplate(promptTemplate, templateData).trim() : "";

  const contextContent = buildContextMessage(ctx);
  const history = readHistory(ctx);
  const messages: ChatMessage[] = [
    { role: "system", content: contextContent },
    ...history,
  ];
  if (renderedPrompt) {
    messages.push({ role: "user", content: renderedPrompt });
  }

  const env: Record<string, string> = { ...buildPaperclipEnv(agent), PAPERCLIP_RUN_ID: runId };
  if (authToken) env.PAPERCLIP_API_KEY = authToken;
  const loggedEnv = buildInvocationEnvForLogs(env, { resolvedCommand: model });

  if (onMeta) {
    await onMeta({
      adapterType: "openai_compatible",
      command: `${baseUrl}/chat/completions`,
      commandNotes: [
        "Invokes an OpenAI-compatible Chat Completions endpoint.",
        apiKey ? "Authorization bearer token configured." : "No API key configured (local servers may accept none).",
      ],
      env: loggedEnv,
      prompt: messages.map((m) => `[${m.role}] ${m.content}`).join("\n"),
      context,
    });
  }

  await onLog("stdout", `[openai-compatible] invoking ${baseUrl}/chat/completions model=${model}\n`);

  const result = await requestCompletion({
    baseUrl,
    apiKey,
    headers,
    model,
    messages,
    temperature,
    maxTokens,
    timeoutSec,
    maxRetries,
    onStderr: (line) => onLog("stderr", `${line}\n`),
  });

  if (result.timedOut) {
    return {
      exitCode: null,
      signal: null,
      timedOut: true,
      errorMessage: `OpenAI-compatible request timed out after ${timeoutSec}s`,
      errorCode: "openai_compatible_timeout",
      provider: "openai-compatible",
    };
  }

  if (result.failureMessage) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: result.failureMessage,
      errorCode: "openai_compatible_request_failed",
      provider: "openai-compatible",
    };
  }

  if (!result.content) {
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      model: result.model,
      provider: "openai-compatible",
      billingType: "api",
      usage: result.usage,
      summary: "No assistant content returned.",
    };
  }

  const nextHistory = [...messages, { role: "assistant" as const, content: result.content }].slice(-HISTORY_WINDOW);

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    model: result.model,
    provider: "openai-compatible",
    billingType: "api",
    usage: result.usage,
    summary: result.content.slice(0, 2000),
    sessionId: null,
    sessionParams: { history: nextHistory },
    resultJson: { content: result.content },
  };
}
