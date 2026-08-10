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
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

interface McpSession {
  sessionId: string | null;
  protocolVersion: string;
}

interface CompletionOutput {
  content: string;
  model: string | null;
  usage: UsageSummary | undefined;
  timedOut: boolean;
  failureMessage: string | null;
  toolCalls: OpenAIToolCall[];
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

function isUnsupportedToolCallOutput(value: string): boolean {
  return /<\|tool_(?:calls?_section|call)_(?:begin|end)\|>|\bfunctions\.[A-Za-z0-9_]+:/i.test(value);
}

function looksLikeJsonRpcMessage(value: unknown): boolean {
  const record = parseObject(value);
  return Boolean(record && ("result" in record || "error" in record || "method" in record || "id" in record));
}

function parseMcpResponseBody(body: string, contentType: string | null): unknown {
  if (!(contentType ?? "").toLowerCase().includes("text/event-stream")) {
    return JSON.parse(body) as unknown;
  }

  const events = body.replace(/\r\n/g, "\n").split(/\n\n+/);
  let firstParsed: unknown;
  let sawData = false;
  let lastError: unknown = null;
  for (const event of events) {
    const dataLines = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).replace(/^ /, ""));
    if (dataLines.length === 0) continue;
    const data = dataLines.join("\n");
    try {
      const parsed = JSON.parse(data) as unknown;
      if (!sawData) {
        firstParsed = parsed;
        sawData = true;
      }
      if (looksLikeJsonRpcMessage(parsed)) return parsed;
    } catch (error) {
      lastError = error;
    }
  }
  if (sawData) return firstParsed;
  if (lastError) throw lastError;
  throw new SyntaxError("MCP SSE response contained no data events");
}

function responseHeader(response: Response, name: string): string | null {
  return response.headers.get(name);
}

async function mcpRequest(
  server: { url: string; token: string },
  session: McpSession,
  request: { id?: number | string; method: string; params?: Record<string, unknown> },
): Promise<unknown> {
  const response = await fetch(server.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${server.token}`,
      ...(session.sessionId ? { "mcp-session-id": session.sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", ...request }),
  });
  const body = await response.text();
  const nextSessionId = responseHeader(response, "mcp-session-id");
  if (nextSessionId) session.sessionId = nextSessionId;
  if (!body.trim()) {
    if (!response.ok) throw new Error(`Paperclip MCP gateway request failed with HTTP ${response.status}.`);
    return null;
  }
  const payload = parseMcpResponseBody(body, response.headers.get("content-type"));
  if (!response.ok) throw new Error(`Paperclip MCP gateway request failed with HTTP ${response.status}.`);
  const error = parseObject(parseObject(payload)?.error);
  if (error) throw new Error(asString(error.message, "Paperclip MCP gateway rejected the request."));
  return payload;
}

async function initializeMcpSession(server: { url: string; token: string }): Promise<McpSession> {
  const session: McpSession = { sessionId: null, protocolVersion: "2025-03-26" };
  const payload = await mcpRequest(server, session, {
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: session.protocolVersion,
      capabilities: {},
      clientInfo: { name: "Paperclip OpenAI-compatible adapter", version: "1.0.0" },
    },
  });
  const result = parseObject(parseObject(payload)?.result);
  const negotiatedVersion = nonEmpty(result?.protocolVersion);
  if (negotiatedVersion) session.protocolVersion = negotiatedVersion;
  await mcpRequest(server, session, {
    method: "notifications/initialized",
    params: {},
  });
  return session;
}

function parseToolCalls(value: unknown): OpenAIToolCall[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = parseObject(entry);
    const fn = parseObject(record?.function);
    const id = nonEmpty(record?.id);
    const name = nonEmpty(fn?.name);
    const args = typeof fn?.arguments === "string" ? fn.arguments : null;
    return id && name && args !== null
      ? [{ id, type: "function" as const, function: { name, arguments: args } }]
      : [];
  });
}

async function listGatewayTools(
  server: { url: string; token: string },
  session: McpSession,
): Promise<OpenAITool[]> {
  const payload = await mcpRequest(server, session, { id: 1, method: "tools/list", params: {} });
  const result = parseObject(parseObject(payload)?.result);
  const tools = Array.isArray(result?.tools) ? result.tools : [];
  return tools.flatMap((entry) => {
    const tool = parseObject(entry);
    const name = nonEmpty(tool?.name);
    if (!name) return [];
    return [{
      type: "function" as const,
      function: {
        name,
        description: nonEmpty(tool?.description) ?? undefined,
        parameters: parseObject(tool?.inputSchema) ?? { type: "object", properties: {} },
      },
    }];
  });
}

async function callGatewayTool(
  server: { url: string; token: string; session: McpSession },
  call: OpenAIToolCall,
): Promise<string> {
  let argumentsValue: unknown = {};
  try {
    argumentsValue = call.function.arguments ? JSON.parse(call.function.arguments) : {};
  } catch {
    return "Tool call rejected: arguments were not valid JSON.";
  }
  const payload = await mcpRequest(server, server.session, {
    id: call.id,
    method: "tools/call",
    params: { name: call.function.name, arguments: argumentsValue },
  });
  const result = parseObject(parseObject(payload)?.result);
  const content = Array.isArray(result?.content) ? result.content : [];
  return content
    .map((item) => asString(parseObject(item)?.text, ""))
    .filter(Boolean)
    .join("\n") || JSON.stringify(result?.structuredContent ?? result ?? null);
}

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  return normalized.replace(/\/chat\/completions$/i, "");
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
    "Paperclip may provide governed MCP tools in the request. Use only the tools presented by the API and never invent tool names or endpoints.",
    "Do not emit pseudo tool calls or claim that you fetched data or changed Paperclip state unless a governed tool result confirms it.",
    "If no tools are presented, return a concise plain-text answer based only on the context supplied in this message.",
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
  tools?: OpenAITool[];
  onStderr: (line: string) => Promise<void>;
}): Promise<CompletionOutput> {
  const { baseUrl, apiKey, headers, model, messages, temperature, maxTokens, timeoutSec, maxRetries, tools, onStderr } = args;
  const url = `${baseUrl}/chat/completions`;
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
    ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
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
        return { content: "", model: null, usage: undefined, timedOut: false, failureMessage: lastError, toolCalls: [] };
      }

      const parsed = parseJson(rawBody);
      if (!parsed) {
        return {
          content: "",
          model: null,
          usage: undefined,
          timedOut: false,
          failureMessage: "Provider returned an invalid JSON response.",
          toolCalls: [],
        };
      }

      const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
      const first = parseObject(choices[0]);
      const message = parseObject(first?.message);
      const content = asString(message?.content, "").trim();
      const toolCalls = parseToolCalls(message?.tool_calls);
      const usage = parseOpenAICompatibleUsage(parsed.usage);
      const returnedModel = typeof parsed.model === "string" && parsed.model.trim() ? parsed.model : null;

      const tokens = usage ? `${usage.inputTokens}+${usage.outputTokens}` : "unknown";
      await onStderr(`[openai-compatible] completion model=${returnedModel ?? model} tokens=${tokens}`);

      if (content && isUnsupportedToolCallOutput(content)) {
        return {
          content: "",
          model: returnedModel,
          usage,
          timedOut: false,
          failureMessage:
            "The provider returned unsupported tool-call markup instead of OpenAI tool_calls. " +
            "Use an OpenAI tool-calling model or a tool-enabled local adapter such as claude_local or codex_local.",
          toolCalls: [],
        };
      }

      return {
        content,
        model: returnedModel,
        usage,
        timedOut: false,
        failureMessage: content || toolCalls.length > 0 ? null : "Provider returned no assistant content.",
        toolCalls,
      };
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
        return { content: "", model: null, usage: undefined, timedOut: true, failureMessage: lastError, toolCalls: [] };
      }
      if (attempt < maxRetries) continue;
      return { content: "", model: null, usage: undefined, timedOut: false, failureMessage: lastError, toolCalls: [] };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return { content: "", model: null, usage: undefined, timedOut: false, failureMessage: lastError, toolCalls: [] };
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { config, agent, runId, context, onLog, onMeta, authToken } = ctx;

  const baseUrl = normalizeBaseUrl(asString(config.baseUrl, DEFAULT_OPENAI_COMPATIBLE_BASE_URL));
  const apiKey = nonEmpty(config.apiKey) ?? nonEmpty(config.token);
  const headers = asStringRecord(config.headers);
  const authorizationHeader = Object.keys(headers).find((key) => key.toLowerCase() === "authorization");
  if (apiKey && authorizationHeader) {
    delete headers[authorizationHeader];
  }
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

  const runtimeServers = ctx.runtimeMcp?.getServers() ?? [];
  const toolRoutes = new Map<string, { url: string; token: string; session: McpSession }>();
  const tools: OpenAITool[] = [];
  for (const server of runtimeServers) {
    try {
      const session = await initializeMcpSession(server);
      const discovered = await listGatewayTools(server, session);
      for (const tool of discovered) {
        if (toolRoutes.has(tool.function.name)) continue;
        toolRoutes.set(tool.function.name, { ...server, session });
        tools.push(tool);
      }
    } catch (error) {
      await onLog(
        "stderr",
        `[openai-compatible] MCP discovery skipped for ${server.name}: ${error instanceof Error ? error.message : "request failed"}\n`,
      );
    }
  }
  if (tools.length > 0) {
    await onLog("stdout", `[openai-compatible] discovered ${tools.length} Paperclip MCP tool(s).\n`);
  }

  let result: CompletionOutput = {
    content: "",
    model: null,
    usage: undefined,
    timedOut: false,
    failureMessage: "OpenAI-compatible completion did not run.",
    toolCalls: [],
  };
  const maxToolRounds = 8;
  for (let round = 0; round < maxToolRounds; round++) {
    result = await requestCompletion({
      baseUrl,
      apiKey,
      headers,
      model,
      messages,
      temperature,
      maxTokens,
      timeoutSec,
      maxRetries,
      tools,
      onStderr: (line) => onLog("stderr", `${line}\n`),
    });
    if (result.toolCalls.length > 0 && tools.length === 0) {
      result = {
        ...result,
        content: "",
        toolCalls: [],
        failureMessage:
          "The provider returned structured tool calls, but no Paperclip MCP gateway tools were discovered. " +
          "Configure an active governed MCP gateway or use a text-only response.",
      };
      break;
    }
    if (result.toolCalls.length === 0) break;
    if (round === maxToolRounds - 1) {
      result = {
        ...result,
        content: "",
        toolCalls: [],
        failureMessage: "The model exceeded the maximum Paperclip MCP tool-call rounds.",
      };
      break;
    }
    messages.push({
      role: "assistant",
      content: result.content,
      tool_calls: result.toolCalls,
    });
    for (const call of result.toolCalls) {
      const route = toolRoutes.get(call.function.name);
      let content = "Tool call rejected: the tool is not available through the Paperclip MCP gateway.";
      if (route) {
        try {
          content = await callGatewayTool(route, call);
        } catch (error) {
          content = `Tool call failed: ${error instanceof Error ? error.message : "Paperclip gateway request failed."}`;
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }

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
