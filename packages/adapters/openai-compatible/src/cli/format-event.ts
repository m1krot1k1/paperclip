import pc from "picocolors";

export function printOpenAICompatibleStreamEvent(raw: string, debug: boolean): void {
  const line = raw.replace(/\n$/, "");
  if (!line.trim()) return;

  if (line.startsWith("[openai-compatible]")) {
    const body = line.replace(/^\[openai-compatible\]\s*/, "");
    if (body.startsWith("request failed") || body.startsWith("error") || body.startsWith("transient retry")) {
      console.log(pc.red(body));
      return;
    }
    if (body.startsWith("completion ")) {
      console.log(pc.blue(body));
      return;
    }
    console.log(pc.cyan(body));
    return;
  }

  if (!debug) {
    console.log(line);
    return;
  }
  console.log(pc.gray(line));
}
