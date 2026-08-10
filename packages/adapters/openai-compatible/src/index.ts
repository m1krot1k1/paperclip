export const type = "openai_compatible";

export const label = "OpenAI Compatible";

export const DEFAULT_OPENAI_COMPATIBLE_MODEL = "gpt-4o";

export const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "https://api.openai.com/v1";

export const models: { id: string; label: string }[] = [
  { id: DEFAULT_OPENAI_COMPATIBLE_MODEL, label: "gpt-4o" },
  { id: "gpt-4o-mini", label: "gpt-4o-mini" },
  { id: "gpt-4.1", label: "gpt-4.1" },
  { id: "gpt-4.1-mini", label: "gpt-4.1-mini" },
];

export const agentConfigurationDoc = `# openai_compatible agent configuration

Adapter: openai_compatible

Use when:
- You want Paperclip to drive a hosted model exposed through an OpenAI-compatible Chat Completions API (\`POST {baseUrl}/chat/completions\`).
- The provider is a self-hosted OpenAI-compatible gateway, a local model server (vLLM, Ollama, LM Studio, llama.cpp), or any provider that mirrors OpenAI's \`/v1/chat/completions\` request/response schema.
- You need a lightweight agent that can use Paperclip-managed MCP gateway tools when the configured model supports OpenAI tool calling.

Don't use when:
- You need a full interactive coding-agent CLI with session/tool ecosystem (use claude_local, codex_local, etc.).
- You need a webhook-style external invocation (use http or openclaw_gateway).
- You only need a one-shot script without an AI loop (use process).

Core fields:
- baseUrl (string, required): OpenAI-compatible base URL, e.g. \`https://api.openai.com/v1\`, \`http://localhost:11434/v1\` (Ollama), or \`http://localhost:8000/v1\` (vLLM/LM Studio). Do not include \`/chat/completions\` — the adapter appends it.
- apiKey (string, optional): bearer token for \`Authorization: Bearer <key>\`. Some local servers (Ollama, vLLM without auth) accept an empty/placeholder key.
- model (string, optional): model id sent in the request body. Defaults to \`gpt-4o\`.
- promptTemplate (string, optional): run prompt template rendered with Paperclip context.
- headers (object, optional): extra request headers merged on top of \`Authorization\` and \`Content-Type\`.
- timeoutSec (number, optional): request timeout in seconds (default 300).
- maxRetries (number, optional): transient retry count (default 2).
- temperature (number, optional): sampling temperature (default 0.2).
- maxTokens (number, optional): max completion tokens (default provider).
- env (object, optional): KEY=VALUE environment variables made available to the agent via the Paperclip runtime (these are not sent in the request body; the hook/message carries the Paperclip wake context instead).

Operational notes:
- The adapter sends \`POST {baseUrl}/chat/completions\` with OpenAI \`messages\`, \`model\`, \`temperature\`, \`max_completion_tokens\`, and optional \`tools\`. When Paperclip-managed MCP gateways are present, tool discovery and calls stay scoped to the short-lived gateway tokens issued for the heartbeat run.
- Paperclip wake context (task, wake reason, API base) is embedded in the system message. Models without OpenAI tool-calling support retain the text-only fallback; use \`claude_local\` or \`codex_local\` when full workspace tooling is required.
- Usage/cost is parsed from the standard OpenAI \`usage\` object (\`prompt_tokens\`, \`completion_tokens\`, \`cached_tokens\`) when the provider returns it.
- \`apiKey\` and any \`Authorization\`-like request headers are redacted from invocation logs.
`;
