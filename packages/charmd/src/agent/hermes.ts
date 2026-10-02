import { postStream, sseJson } from "./http";
import type { AgentAdapter } from "./types";

type HermesOptions = { baseUrl: string; apiKey?: string; model: string };
type ResponseEvent = { type?: string; delta?: string };

// Hermes' Responses API chains turns itself when given a stable `conversation`, so charmd stays
// stateless; X-Hermes-Session-Key scopes Hermes' long-term memory to this charm.
function createHermesAgent(options: HermesOptions): AgentAdapter {
  return {
    name: "hermes",
    async *reply({ sessionKey, text, signal }) {
      const body = await postStream(
        `${options.baseUrl.replace(/\/$/, "")}/responses`,
        {
          ...(options.apiKey
            ? { authorization: `Bearer ${options.apiKey}` }
            : {}),
          "x-hermes-session-key": sessionKey,
        },
        {
          model: options.model,
          stream: true,
          input: text,
          conversation: sessionKey,
          store: true,
        },
        signal
      );
      for await (const event of sseJson(body)) {
        const { type, delta } = event as ResponseEvent;
        if (type === "response.output_text.delta" && delta) yield delta;
      }
    },
  };
}

export { createHermesAgent };
export type { HermesOptions };
