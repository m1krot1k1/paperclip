import type { UIAdapterModule } from "../types";
import { parseOpenAICompatibleStdoutLine } from "./parse-stdout";
import { OpenAICompatibleConfigFields } from "./config-fields";
import { buildOpenAICompatibleConfig } from "./build-config";

export const openAICompatibleUIAdapter: UIAdapterModule = {
  type: "openai_compatible",
  label: "OpenAI Compatible",
  parseStdoutLine: parseOpenAICompatibleStdoutLine,
  ConfigFields: OpenAICompatibleConfigFields,
  buildAdapterConfig: buildOpenAICompatibleConfig,
};
