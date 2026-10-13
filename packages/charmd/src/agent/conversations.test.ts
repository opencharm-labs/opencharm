import { describe, expect, it } from "vitest";

import { withConversations } from "./conversations";
import type { AgentAdapter } from "./types";

const KEY = "opencharm-c_1";
const MINUTE = 60_000;

// An agent that numbers its conversations per charm, so a test can see when one started over.
function counting() {
  const generation = new Map<string, number>();
  const resets: string[] = [];
  let release: (() => void) | undefined;
  const agent: AgentAdapter = {
    name: "counting",
    reset: (sessionKey) => {
      resets.push(sessionKey);
      generation.set(sessionKey, (generation.get(sessionKey) ?? 0) + 1);
    },
    async *reply({ sessionKey, text }) {
      if (text === "wait") await new Promise<void>((r) => (release = r));
      yield `${sessionKey}#${generation.get(sessionKey) ?? 0}`;
    },
  };
  return { agent, resets, release: () => release?.() };
}

async function ask(agent: AgentAdapter, text = "hi", sessionKey = KEY) {
  let out = "";
  for await (const chunk of agent.reply({
    sessionKey,
    text,
    signal: new AbortController().signal,
  }))
    out += chunk;
  return out;
}

describe("new conversations", () => {
  it("starts a new conversation at once when the charm is between turns", async () => {
    const inner = counting();
    const { agent, startNew } = withConversations(inner.agent, {
      afterMinutes: 0,
    });
    expect(await ask(agent)).toBe(`${KEY}#0`);
    expect(startNew(KEY)).toBe("now");
    expect(await ask(agent)).toBe(`${KEY}#1`);
    expect(await ask(agent, "hi", "opencharm-c_2")).toBe("opencharm-c_2#0");
  });

  it("lets the turn that asked finish, and starts over right after it", async () => {
    const inner = counting();
    const entries: Record<string, unknown>[] = [];
    const { agent, startNew } = withConversations(inner.agent, {
      afterMinutes: 0,
      log: (entry) => entries.push(entry),
    });
    const turn = ask(agent, "wait");
    await Promise.resolve();
    expect(startNew(KEY)).toBe("after-turn");
    expect(inner.resets).toEqual([]);
    inner.release();
    expect(await turn).toBe(`${KEY}#0`);
    expect(inner.resets).toEqual([KEY]);
    expect(entries).toEqual([
      { event: "new-conversation", session: KEY, reason: "asked" },
    ]);
    expect(await ask(agent)).toBe(`${KEY}#1`);
  });

  it("starts over before a turn that supersedes the one that asked, while it's still winding down", async () => {
    const inner = counting();
    const { agent, startNew } = withConversations(inner.agent, {
      afterMinutes: 0,
    });
    const first = new AbortController();
    const iterator = agent
      .reply({ sessionKey: KEY, text: "wait", signal: first.signal })
      [Symbol.asyncIterator]();
    const pending = iterator.next();
    await Promise.resolve();
    expect(startNew(KEY)).toBe("after-turn");
    // A typed line cancels the turn and asks again in the same tick, as TurnController.typed does.
    first.abort();
    expect(await ask(agent, "typed")).toBe(`${KEY}#1`);
    expect(inner.resets).toEqual([KEY]);
    inner.release();
    await pending;
    await iterator.return?.(undefined);
    expect(inner.resets).toEqual([KEY]);
  });

  it("starts over after a pause longer than newConversationAfterMinutes", async () => {
    let clock = 0;
    const inner = counting();
    const { agent } = withConversations(inner.agent, {
      afterMinutes: 120,
      now: () => clock,
    });
    await ask(agent);
    clock += 120 * MINUTE;
    expect(await ask(agent)).toBe(`${KEY}#0`);
    clock += 120 * MINUTE + 1;
    expect(await ask(agent)).toBe(`${KEY}#1`);
    expect(inner.resets).toEqual([KEY]);
  });

  it("starts over before warming up the agent, so the new session is the one warmed", async () => {
    let clock = 0;
    const order: string[] = [];
    const inner = counting();
    const { agent } = withConversations(
      {
        ...inner.agent,
        reset: (key) => {
          order.push("reset");
          inner.agent.reset?.(key);
        },
        warm: () => order.push("warm"),
      },
      { afterMinutes: 1, now: () => clock }
    );
    await ask(agent);
    clock += 2 * MINUTE;
    agent.warm?.(KEY);
    expect(order).toEqual(["reset", "warm"]);
  });

  it("never starts over on a pause when newConversationAfterMinutes is 0", async () => {
    let clock = 0;
    const inner = counting();
    const { agent } = withConversations(inner.agent, {
      afterMinutes: 0,
      now: () => clock,
    });
    await ask(agent);
    clock += 365 * 24 * 60 * MINUTE;
    expect(await ask(agent)).toBe(`${KEY}#0`);
    expect(inner.resets).toEqual([]);
  });

  it("works with an agent that has nothing to forget", async () => {
    const { agent, startNew } = withConversations(
      {
        name: "plain",
        async *reply() {
          yield await Promise.resolve("ok");
        },
      },
      { afterMinutes: 1 }
    );
    expect(startNew(KEY)).toBe("now");
    expect(await ask(agent)).toBe("ok");
  });
});
