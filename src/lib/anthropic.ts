import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;

function client(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY required");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export async function completeText(
  prompt: string,
  opts: { maxTokens?: number; system?: string } = {},
): Promise<string> {
  const res = await client().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: [{ role: "user", content: prompt }],
  });
  const block = res.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}
