import type { AgentAdapter } from "./types";

type FakeOptions = {
  fail?: boolean;
  delayMs?: number;
  reply?: (text: string) => string;
};

// For tests and for trying the charm without any agent: answers "You said: …" in small chunks.
function createFakeAgent(options: FakeOptions = {}): AgentAdapter {
  return {
    name: "fake",
    async *reply({ text, signal }) {
      if (options.fail) throw new Error("The fake agent was told to fail");
      const answer = options.reply ? options.reply(text) : `You said: ${text}.`;
      for (const word of answer.split(/(?<= )/)) {
        if (signal.aborted) return;
        if (options.delayMs)
          await new Promise((r) => setTimeout(r, options.delayMs));
        yield word;
      }
    },
  };
}

export { createFakeAgent };
export type { FakeOptions };
