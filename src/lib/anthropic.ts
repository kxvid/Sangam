import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY required");
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const CLAUDE_MODEL = "claude-sonnet-4-6";

export async function completeText(
  prompt: string,
  opts: { maxTokens?: number; system?: string } = {},
): Promise<string> {
  const res = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: [{ role: "user", content: prompt }],
  });

  const block = res.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}
