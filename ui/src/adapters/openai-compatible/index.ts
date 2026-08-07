import type { UIAdapterModule } from "../types";
import { parseOpenAICompatibleStdoutLine } from "@paperclipai/adapter-openai-compatible/ui";
import { OpenAICompatibleConfigFields } from "./config-fields";
import { buildOpenAICompatibleConfig } from "@paperclipai/adapter-openai-compatible/ui";

export const openAICompatibleUIAdapter: UIAdapterModule = {
  type: "openai_compatible",
  label: "OpenAI Compatible",
  parseStdoutLine: parseOpenAICompatibleStdoutLine,
  ConfigFields: OpenAICompatibleConfigFields,
  buildAdapterConfig: buildOpenAICompatibleConfig,
};
