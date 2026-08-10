import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";
import { execute } from "./execute.js";

function makeContext(): AdapterExecutionContext {
  return {
    runId: "run-1",
    agent: {
      id: "agent-1",
      companyId: "company-1",
      name: "OpenAI Compatible",
      adapterType: "openai_compatible",
      adapterConfig: {},
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: null,
    },
    config: {
      baseUrl: "https://provider.example/v1",
      apiKey: "provider-key",
      model: "test-model",
      maxRetries: 0,
    },
    context: { issueId: "issue-1" },
    runtimeMcp: {
      getServers: () => [{
        name: "Paperclip",
        url: "https://paperclip.example/mcp",
        token: "mcp-token",
        connectionId: "connection-1",
      }],
    },
    onLog: vi.fn(async () => undefined),
  };
}

function jsonResponse(payload: unknown, contentType = "application/json", extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": contentType, ...extraHeaders },
  });
}

function sseResponse(payload: unknown, extraHeaders?: Record<string, string>): Response {
  return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream", ...extraHeaders },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openai-compatible execute", () => {
  it("discovers MCP tools over SSE and forwards a tool call through the gateway", async () => {
    let completionCount = 0;
    const mcpMethods: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body));
      if (url.endsWith("/mcp")) {
        mcpMethods.push(body.method);
        if (body.method === "initialize") {
          return jsonResponse({
            jsonrpc: "2.0",
            id: body.id,
            result: { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: {} },
          }, "application/json", { "mcp-session-id": "session-1" });
        }
        if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      }
      if (url.endsWith("/mcp") && body.method === "tools/list") {
        return sseResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: { tools: [{ name: "issue_lookup", description: "Look up an issue", inputSchema: { type: "object" } }] },
        }, { "mcp-session-id": "session-1" });
      }
      if (url.endsWith("/chat/completions")) {
        completionCount += 1;
        if (completionCount === 1) {
          return jsonResponse({
            model: "test-model",
            choices: [{
              message: {
                role: "assistant",
                content: "",
                tool_calls: [{
                  id: "call-1",
                  type: "function",
                  function: { name: "issue_lookup", arguments: "{\"issueId\":\"issue-1\"}" },
                }],
              },
            }],
          });
        }
        return jsonResponse({
          model: "test-model",
          choices: [{ message: { role: "assistant", content: "done" } }],
        });
      }
      return jsonResponse({
        jsonrpc: "2.0",
        id: body.id,
        result: { content: [{ type: "text", text: "issue details" }] },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await execute(makeContext());
    expect(result.exitCode).toBe(0);
    expect(result.summary).toBe("done");
    expect(mcpMethods).toEqual(["initialize", "notifications/initialized", "tools/list", "tools/call"]);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ "mcp-session-id": "session-1" }),
    }));
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ "mcp-session-id": "session-1" }),
    }));
    expect(fetchMock.mock.calls[4]?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ "mcp-session-id": "session-1" }),
    }));
    expect(fetchMock).toHaveBeenCalledWith(
      "https://paperclip.example/mcp",
      expect.objectContaining({
        body: expect.stringContaining("\"method\":\"tools/call\""),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://paperclip.example/mcp",
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: "application/json, text/event-stream",
          authorization: "Bearer mcp-token",
        }),
      }),
    );
    const completionBody = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body));
    expect(completionBody.tools).toEqual([
      expect.objectContaining({ function: expect.objectContaining({ name: "issue_lookup" }) }),
    ]);
  });

  it("preserves OpenAI tool-call message shape across the tool loop", async () => {
    const completionBodies: Array<Record<string, unknown>> = [];
    const mcpMethods: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body));
      if (url.endsWith("/mcp")) {
        mcpMethods.push(body.method);
        if (body.method === "initialize") {
          return jsonResponse({
            jsonrpc: "2.0",
            id: body.id,
            result: { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: {} },
          }, "application/json", { "mcp-session-id": "session-2" });
        }
        if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
        if (body.method === "tools/list") {
          return jsonResponse({
            jsonrpc: "2.0",
            id: body.id,
            result: { tools: [{ name: "issue_lookup", inputSchema: { type: "object" } }] },
          }, "application/json", { "mcp-session-id": "session-2" });
        }
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: { content: [{ type: "text", text: "looked up" }] },
        });
      }
      completionBodies.push(body);
      if (completionBodies.length === 1) {
        return jsonResponse({
          model: "test-model",
          choices: [{
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{
                id: "call-1",
                type: "function",
                function: { name: "issue_lookup", arguments: "{\"issueId\":\"issue-1\"}" },
              }],
            },
          }],
        });
      }
      return jsonResponse({
        model: "test-model",
        choices: [{ message: { role: "assistant", content: "final answer" } }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await execute(makeContext());
    expect(result.summary).toBe("final answer");
    expect(mcpMethods).toEqual(["initialize", "notifications/initialized", "tools/list", "tools/call"]);
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ "mcp-session-id": "session-2" }),
    }));
    expect(completionBodies[1]?.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "assistant",
        content: "",
        tool_calls: [expect.objectContaining({ id: "call-1", type: "function" })],
      }),
      expect.objectContaining({ role: "tool", tool_call_id: "call-1", content: "looked up" }),
    ]));
  });

  it("stops after eight completion rounds when the model keeps requesting tools", async () => {
    let completionCount = 0;
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body));
      if (url.endsWith("/mcp")) {
        if (body.method === "initialize") {
          return jsonResponse({
            jsonrpc: "2.0",
            id: body.id,
            result: { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: {} },
          }, "application/json", { "mcp-session-id": "session-limit" });
        }
        if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
        if (body.method === "tools/list") {
          return jsonResponse({
            jsonrpc: "2.0",
            id: body.id,
            result: { tools: [{ name: "issue_lookup", inputSchema: { type: "object" } }] },
          });
        }
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: { content: [{ type: "text", text: "looked up" }] },
        });
      }
      completionCount += 1;
      return jsonResponse({
        model: "test-model",
        choices: [{
          message: {
            role: "assistant",
            content: "",
            tool_calls: [{
              id: `call-${completionCount}`,
              type: "function",
              function: { name: "issue_lookup", arguments: "{}" },
            }],
          },
        }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await execute(makeContext());

    expect(completionCount).toBe(8);
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toContain("exceeded the maximum Paperclip MCP tool-call rounds");
  });

  it("rejects legacy pseudo-markup instead of treating it as a tool call", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      if (String(input).endsWith("/mcp")) {
        return jsonResponse({ jsonrpc: "2.0", id: 1, result: { tools: [] } });
      }
      return jsonResponse({
        model: "test-model",
        choices: [{ message: { role: "assistant", content: "<|tool_call_begin|>functions.issue_lookup: {}" } }],
      });
    }));

    const result = await execute(makeContext());
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toContain("unsupported tool-call markup");
  });

  it("rejects structured tool calls when gateway discovery returns no tools", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      if (String(input).endsWith("/mcp")) {
        return jsonResponse({ jsonrpc: "2.0", id: 1, result: { tools: [] } });
      }
      return jsonResponse({
        model: "test-model",
        choices: [{
          message: {
            role: "assistant",
            content: "",
            tool_calls: [{
              id: "call-1",
              type: "function",
              function: { name: "issue_lookup", arguments: "{}" },
            }],
          },
        }],
      });
    }));

    const result = await execute(makeContext());
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toContain("no Paperclip MCP gateway tools were discovered");
  });
});
