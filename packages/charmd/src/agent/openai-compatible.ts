import { postStream, sseJson } from "./http";
import type { AgentAdapter } from "./types";

type OpenAiCompatibleOptions = {
  baseUrl: string;
  apiKey?: string;
  model: string;
};
type ChatChunk = { choices?: Array<{ delta?: { content?: string } }> };

// Chat Completions with stream: true. The session key goes in `user`: OpenClaw's Gateway derives
// a stable session from it; other agents at least see which charm is talking.
function createOpenAiCompatibleAgent(
  options: OpenAiCompatibleOptions
): AgentAdapter {
  return {
    name: "openai-compatible",
    async *reply({ sessionKey, text, signal }) {
      const body = await postStream(
        `${options.baseUrl.replace(/\/$/, "")}/chat/completions`,
        options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {},
        {
          model: options.model,
          stream: true,
          user: sessionKey,
          messages: [{ role: "user", content: text }],
        },
        signal
      );
      for await (const chunk of sseJson(body)) {
        const content = (chunk as ChatChunk).choices?.[0]?.delta?.content;
        if (content) yield content;
      }
    },
  };
}

export { createOpenAiCompatibleAgent };
export type { OpenAiCompatibleOptions };
