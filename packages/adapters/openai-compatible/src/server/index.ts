import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";
import { parseObject } from "@paperclipai/adapter-utils/server-utils";

export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export {
  parseOpenAICompatibleErrorMessage,
  parseOpenAICompatibleUsage,
} from "./parse.js";

function readHistory(raw: unknown): unknown[] | null {
  const record = parseObject(raw);
  const history = record?.history;
  return Array.isArray(history) ? history : null;
}

/**
 * The session state is the bounded chat history used to resume conversation
 * context across heartbeats. This codec round-trips it through the DB.
 */
export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    const history = readHistory(raw);
    if (!history) return null;
    return { history };
  },
  serialize(params) {
    const history = readHistory(params);
    if (!history) return null;
    return { history };
  },
  getDisplayId(params) {
    const history = readHistory(params);
    if (!history || history.length === 0) return null;
    return `session (${history.length} messages)`;
  },
};
