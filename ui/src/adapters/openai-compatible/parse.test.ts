import { describe, expect, it } from "vitest";
import { parseOpenAICompatibleStdoutLine } from "./parse-stdout";
import { buildOpenAICompatibleConfig } from "./build-config";

const ts = "2026-08-07T00:00:00.000Z";

describe("openai-compatible UI parser", () => {
  it("passes through raw stdout for unrecognized lines", () => {
    const entries = parseOpenAICompatibleStdoutLine("some random output", ts);
    expect(entries).toEqual([{ kind: "stdout", ts, text: "some random output" }]);
  });

  it("maps the invoking line to a system entry", () => {
    const entries = parseOpenAICompatibleStdoutLine(
      "[openai-compatible] invoking https://api.openai.com/v1/chat/completions model=gpt-4o\n",
      ts,
    );
    expect(entries[0].kind).toBe("system");
    expect(entries[0].text).toContain("invoking");
  });

  it("maps the completion line to a result entry", () => {
    const entries = parseOpenAICompatibleStdoutLine(
      "[openai-compatible] completion model=gpt-4o tokens=100+50",
      ts,
    );
    expect(entries[0].kind).toBe("result");
  });

  it("maps request failure lines to stderr", () => {
    const entries = parseOpenAICompatibleStdoutLine(
      "[openai-compatible] request failed: HTTP 401",
      ts,
    );
    expect(entries[0].kind).toBe("stderr");
  });
});

describe("openai-compatible build-config", () => {
  const base = {
    adapterType: "openai_compatible",
    cwd: "",
    promptTemplate: "",
    model: "",
    thinkingEffort: "",
    chrome: false,
    dangerouslySkipPermissions: false,
    search: false,
    fastMode: false,
    dangerouslyBypassSandbox: false,
    command: "",
    args: "",
    extraArgs: "",
    envVars: "",
    envBindings: {},
    url: "",
    bootstrapPrompt: "",
    maxTurnsPerRun: 0,
    heartbeatEnabled: false,
    intervalSec: 0,
  } as const;

  it("builds adapterConfig from form values", () => {
    const config = buildOpenAICompatibleConfig({
      ...base,
      url: "https://api.openai.com/v1",
      authToken: "sk-test",
      model: "gpt-4o-mini",
      promptTemplate: "Do the thing",
      timeoutSec: 120,
    });
    expect(config.baseUrl).toBe("https://api.openai.com/v1");
    expect(config.apiKey).toBe("sk-test");
    expect(config.model).toBe("gpt-4o-mini");
    expect(config.promptTemplate).toBe("Do the thing");
    expect(config.timeoutSec).toBe(120);
  });

  it("does not emit an apiKey when none is provided (local servers may accept none)", () => {
    const config = buildOpenAICompatibleConfig({
      ...base,
      url: "http://localhost:11434/v1",
    });
    expect(config.apiKey).toBeUndefined();
    expect(config.baseUrl).toBe("http://localhost:11434/v1");
  });
});
