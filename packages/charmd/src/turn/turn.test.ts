import type { ServerMessage } from "@opencharm-labs/protocol/messages";
import { describe, expect, it } from "vitest";

import type { AgentAdapter } from "../agent/types";
import { createFakeAgent } from "../agent/fake";
import { opusPacketSamples48k } from "../audio/ogg-opus";
import { createFakeVoice } from "../voice/fake";
import { VoiceNotReady } from "../voice/models";
import type { VoiceProvider } from "../voice/types";
import { TurnController } from "./turn";

type Out = ServerMessage | { audio: number };

function setup(
  options: {
    agent?: AgentAdapter;
    voice?: VoiceProvider;
    timeoutMs?: number;
    ask?: (
      text: string,
      options?: { signal?: AbortSignal }
    ) => Promise<boolean>;
  } = {}
) {
  const out: Out[] = [];
  const logs: Array<Record<string, unknown>> = [];
  const turn = new TurnController({
    voice: options.voice ?? createFakeVoice({ transcript: "what's on today" }),
    agent:
      options.agent ??
      createFakeAgent({
        reply: () => "You have two meetings today. The first is at nine.",
      }),
    sessionKey: "opencharm-c_1",
    send: (m) => out.push(m),
    sendAudio: (p) => out.push({ audio: p.length }),
    timeoutMs: options.timeoutMs ?? 5000,
    log: (entry) => logs.push(entry),
    sleep: () => Promise.resolve(),
    ...(options.ask ? { ask: options.ask } : {}),
  });
  const faces = () =>
    out.flatMap((m) => ("op" in m && m.op === "face" ? [m.state] : []));
  const kinds = () =>
    out.map((m) =>
      "audio" in m
        ? "audio"
        : m.type === "charm"
          ? `face:${"state" in m ? m.state : ""}`
          : m.type === "tts"
            ? `tts:${m.state}`
            : m.type
    );
  return { turn, out, logs, faces, kinds };
}

async function speak(turn: TurnController, frames = 5) {
  turn.listenStart();
  for (let i = 0; i < frames; i++) turn.audio(Buffer.from([0xf8, 1, 2, 3]));
  await turn.listenStop();
}

describe("a full turn", () => {
  it("goes listening → thinking → heard text → speech → idle", async () => {
    const { turn, faces, kinds, out } = setup();
    await speak(turn);
    expect(faces()).toEqual(["listening", "thinking", "idle"]);
    const order = kinds().filter(
      (k, i, all) => k !== "audio" || all[i - 1] !== "audio"
    );
    expect(order).toEqual([
      "face:listening",
      "face:thinking",
      "stt",
      "tts:start",
      "tts:sentence_start",
      "audio",
      "tts:sentence_start",
      "audio",
      "tts:stop",
      "face:idle",
    ]);
    expect(out.find((m) => "type" in m && m.type === "stt")).toMatchObject({
      text: "what's on today",
    });
  });

  it("starts speaking the first sentence before the agent has finished", async () => {
    let finishAgent: () => void = () => undefined;
    const agent: AgentAdapter = {
      name: "slow",
      async *reply() {
        yield "First sentence is here. ";
        await new Promise<void>((resolve) => (finishAgent = resolve));
        yield "Second sentence arrives later.";
      },
    };
    const { turn, kinds } = setup({ agent });
    turn.listenStart();
    turn.audio(Buffer.from([0xf8, 0]));
    const done = turn.listenStop();
    await new Promise((r) => setTimeout(r, 50));
    expect(kinds()).toContain("tts:sentence_start");
    expect(kinds()).not.toContain("tts:stop");
    finishAgent();
    await done;
    expect(kinds()).toContain("tts:stop");
  });

  it("logs timings without transcripts by default", async () => {
    const { turn, logs } = setup();
    await speak(turn);
    expect(logs[0]).toMatchObject({ event: "turn", outcome: "done" });
    expect(logs[0]).toHaveProperty("firstAudioMs");
    expect(JSON.stringify(logs)).not.toContain("what's on today");
  });
});

describe("when things go wrong", () => {
  it("shows the failed face with a line when the agent can't be reached", async () => {
    const { turn, out } = setup({
      agent: { ...createFakeAgent({ fail: true }), name: "hermes" },
    });
    await speak(turn);
    expect(out.at(-1)).toEqual({
      type: "charm",
      op: "face",
      state: "failed",
      text: "Can't reach Hermes",
    });
  });

  it("gives up after the timeout", async () => {
    const agent: AgentAdapter = {
      name: "stuck",
      async *reply({ signal }) {
        await new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted")))
        );
        yield "never";
      },
    };
    const { turn, out } = setup({ agent, timeoutMs: 50 });
    await speak(turn);
    expect(out.at(-1)).toEqual({
      type: "charm",
      op: "face",
      state: "failed",
      text: "That took too long.",
    });
  });

  it("goes back to idle, without asking the agent, when nothing was heard", async () => {
    let asked = false;
    const agent: AgentAdapter = {
      name: "a",
      async *reply() {
        asked = true;
        yield await Promise.resolve("");
      },
    };
    const { turn, faces } = setup({
      agent,
      voice: createFakeVoice({ transcript: "" }),
    });
    await speak(turn);
    expect(asked).toBe(false);
    expect(faces().at(-1)).toBe("idle");
  });

  it("goes back to idle when the key was only tapped (no audio)", async () => {
    const { turn, faces } = setup();
    await speak(turn, 0);
    expect(faces()).toEqual(["listening", "idle"]);
  });
});

describe("interruptions", () => {
  it("abort stops speech and returns to idle", async () => {
    let release: () => void = () => undefined;
    const agent: AgentAdapter = {
      name: "long",
      async *reply({ signal }) {
        yield "One long first sentence here. ";
        await new Promise<void>((resolve) => {
          release = resolve;
          signal.addEventListener("abort", () => resolve());
        });
        if (!signal.aborted) yield "More text.";
      },
    };
    const { turn, kinds } = setup({ agent });
    turn.listenStart();
    turn.audio(Buffer.from([0xf8, 0]));
    const done = turn.listenStop();
    await new Promise((r) => setTimeout(r, 30));
    turn.abort();
    await done;
    release();
    expect(kinds().slice(-2)).toEqual(["tts:stop", "face:idle"]);
    expect(kinds().filter((k) => k === "tts:sentence_start")).toHaveLength(1);
  });

  it("a new key hold cancels the answer in progress and listens", async () => {
    const agent: AgentAdapter = {
      name: "hang",
      async *reply({ signal }) {
        await new Promise((resolve) =>
          signal.addEventListener("abort", resolve)
        );
        yield "";
      },
    };
    const { turn, faces } = setup({ agent });
    turn.listenStart();
    turn.audio(Buffer.from([0xf8, 0]));
    const first = turn.listenStop();
    await new Promise((r) => setTimeout(r, 10));
    turn.listenStart();
    await first;
    expect(faces().at(-1)).toBe("listening");
    expect(turn.state).toBe("listening");
  });

  it("ignores audio when not listening", () => {
    const { turn, out } = setup();
    turn.audio(Buffer.from([0xf8]));
    expect(out).toEqual([]);
  });
});

describe("say (dev command, later the agent's charm.say tool)", () => {
  it("speaks the given text without listening or asking the agent", async () => {
    const { turn, kinds, faces } = setup({
      agent: createFakeAgent({ fail: true }),
    });
    await turn.say("Testing one two three. This is the charm.");
    const order = kinds().filter(
      (k, i, all) => k !== "audio" || all[i - 1] !== "audio"
    );
    expect(order).toEqual([
      "tts:start",
      "tts:sentence_start",
      "audio",
      "tts:sentence_start",
      "audio",
      "tts:stop",
      "face:idle",
    ]);
    expect(faces()).toEqual(["idle"]);
  });
});

describe("warming the agent", () => {
  it("asks the agent to start up as soon as the key is held", () => {
    const warmed: string[] = [];
    const agent: AgentAdapter = {
      ...createFakeAgent(),
      warm: (key) => warmed.push(key),
    };
    const { turn } = setup({ agent });
    turn.listenStart();
    expect(warmed).toEqual(["opencharm-c_1"]);
  });
});

describe("questions from the agent", () => {
  // An agent that asks before acting, then says what happened.
  const asking: AgentAdapter = {
    name: "claude",
    async *reply({ ask }) {
      const yes = ask ? await ask("write notes/plants.md") : false;
      yield yes ? "Saved." : "I didn't save it.";
    },
  };

  it("asks the person on the charm, naming the agent, and goes on with the answer", async () => {
    const asked: Array<{ text: string; signal?: AbortSignal }> = [];
    const { turn, out } = setup({
      agent: asking,
      ask: (text, options) => {
        asked.push({ text, signal: options?.signal });
        return Promise.resolve(true);
      },
    });
    await speak(turn);
    expect(asked[0]?.text).toBe("Claude Code wants to write notes/plants.md.");
    expect(asked[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(out).toContainEqual({
      type: "tts",
      state: "sentence_start",
      text: "Saved.",
    });
  });

  it("the time spent waiting for the answer doesn't count against the turn", async () => {
    const { turn, out } = setup({
      agent: asking,
      timeoutMs: 200,
      ask: () => new Promise((resolve) => setTimeout(() => resolve(true), 400)),
    });
    await speak(turn);
    expect(out).toContainEqual({
      type: "tts",
      state: "sentence_start",
      text: "Saved.",
    });
  });

  it("cancelling the turn cancels the question", async () => {
    let signal: AbortSignal | undefined;
    const { turn } = setup({
      agent: asking,
      // Like the session: a question stays open until it's answered or its turn is cancelled.
      ask: (_, options) => {
        signal = options?.signal;
        return new Promise((resolve) =>
          signal?.addEventListener("abort", () => resolve(false))
        );
      },
    });
    const running = speak(turn);
    await expect.poll(() => signal).toBeDefined();
    turn.abort();
    await running;
    expect(signal?.aborted).toBe(true);
  });

  it("without a charm to ask, the agent gets no way to ask", async () => {
    const { turn, out } = setup({ agent: asking });
    await speak(turn);
    expect(out).toContainEqual({
      type: "tts",
      state: "sentence_start",
      text: "I didn't save it.",
    });
  });
});

describe("the charm's tools during a turn", () => {
  // An agent that uses the charm's tools while it answers.
  function toolUser(
    use: (turn: TurnController) => Promise<unknown>,
    holder: { turn?: TurnController }
  ): AgentAdapter {
    return {
      name: "claude",
      async *reply() {
        if (holder.turn) await use(holder.turn);
        yield "Done.";
      },
    };
  }

  it("refuses to speak over a turn, and the turn goes on", async () => {
    const holder: { turn?: TurnController; error?: unknown } = {};
    const { turn, out } = setup({
      agent: toolUser(
        (t) => t.say("Hello").catch((error: unknown) => (holder.error = error)),
        holder
      ),
    });
    holder.turn = turn;
    await speak(turn);
    expect(String(holder.error)).toMatch(/reply/);
    expect(out).toContainEqual({
      type: "tts",
      state: "sentence_start",
      text: "Done.",
    });
  });

  it("keeps a face shown by a tool when the turn ends", async () => {
    const holder: { turn?: TurnController } = {};
    const { turn, out } = setup({
      agent: toolUser((t) => {
        t.showFace("needs_you", "The build failed.");
        return Promise.resolve();
      }, holder),
    });
    holder.turn = turn;
    await speak(turn);
    expect(out.at(-1)).toEqual({
      type: "charm",
      op: "face",
      state: "needs_you",
      text: "The build failed.",
    });
  });

  it("a tool's question pauses the turn's clock, like a permission question", async () => {
    const holder: { turn?: TurnController; answer?: boolean } = {};
    const { turn, out } = setup({
      timeoutMs: 200,
      agent: toolUser(async (t) => {
        holder.answer = await t.ask("Order pizza?");
      }, holder),
      ask: () => new Promise((resolve) => setTimeout(() => resolve(true), 400)),
    });
    holder.turn = turn;
    await speak(turn);
    expect(holder.answer).toBe(true);
    expect(out).toContainEqual({
      type: "tts",
      state: "sentence_start",
      text: "Done.",
    });
  });
});

describe("voice that sounds right (spec 003)", () => {
  function recordingVoice(transcript: string, language?: string) {
    const fake = createFakeVoice({ transcript });
    const spoken: string[] = [];
    const voice: VoiceProvider = {
      ...fake,
      ...(language ? { language } : {}),
      synthesize: (text, signal, lang) => {
        spoken.push(`${lang}: ${text}`);
        return fake.synthesize(text, signal);
      },
    };
    return { voice, spoken };
  }

  it("speaks each sentence in its own language, starting from the one it was asked in", async () => {
    const { voice, spoken } = recordingVoice(
      "Che cosa ho in calendario domani?"
    );
    const agent = createFakeAgent({
      reply: () =>
        "Domani hai due riunioni. OK. The first one is with the design team.",
    });
    const { turn } = setup({ voice, agent });
    await speak(turn);
    expect(spoken).toEqual([
      "it: Domani hai due riunioni.",
      "en: OK. The first one is with the design team.",
    ]);
  });

  it("falls back to the configured language when the words don't say", async () => {
    const { voice, spoken } = recordingVoice("Vercel deploy", "it");
    const { turn } = setup({
      voice,
      agent: createFakeAgent({ reply: () => "Fatto, tutto ok." }),
    });
    await speak(turn);
    expect(spoken).toEqual(["it: Fatto, tutto ok."]);
  });

  it("logs when the agent's first words arrived", async () => {
    const { turn, logs } = setup();
    await speak(turn);
    expect(logs[0]).toMatchObject({ event: "turn", outcome: "done" });
    expect(typeof logs[0]?.agentFirstMs).toBe("number");
  });

  it("warms the agent and the voice when asked (a charm unlocked)", () => {
    const warmed: string[] = [];
    const voice: VoiceProvider = {
      ...createFakeVoice(),
      warm: () => {
        warmed.push("voice");
        return Promise.resolve();
      },
    };
    const agent: AgentAdapter = {
      ...createFakeAgent({ reply: () => "Hi." }),
      warm: (key) => warmed.push(`agent:${key}`),
    };
    const { turn } = setup({ voice, agent });
    turn.warm();
    expect(warmed).toEqual(["agent:opencharm-c_1", "voice"]);
  });

  it("says a model is still downloading instead of a generic failure", async () => {
    const voice: VoiceProvider = {
      ...createFakeVoice(),
      transcribe: () =>
        Promise.reject(
          new VoiceNotReady("Parakeet (listening) is still downloading (45%)")
        ),
    };
    const { turn, out } = setup({ voice });
    await speak(turn);
    expect(out.at(-1)).toEqual({
      type: "charm",
      op: "face",
      state: "failed",
      text: "Parakeet (listening) is still downloading (45%)",
    });
  });
});

describe("what the review of the voice update found (spec 003)", () => {
  it("keeps speaking a long answer past the turn's clock: the clock is for getting started", async () => {
    const out: Out[] = [];
    const turn = new TurnController({
      voice: createFakeVoice({ transcript: "tell me a story" }),
      agent: createFakeAgent({
        reply: () =>
          "Once upon a time there was a charm. It lived on a desk and loved to talk. The end of the story.",
      }),
      sessionKey: "opencharm-c_1",
      send: (m) => out.push(m),
      sendAudio: (p) => out.push({ audio: p.length }),
      timeoutMs: 150,
      // Real time: the answer takes far longer to play than the clock allows.
      sleep: (ms) =>
        new Promise((resolve) => setTimeout(resolve, Math.min(ms, 5))),
    });
    await speak(turn);
    const faces = out.flatMap((m) =>
      "op" in m && m.op === "face" ? [m.state] : []
    );
    expect(faces.at(-1)).toBe("idle");
    expect(
      out.filter(
        (m) => "type" in m && m.type === "tts" && m.state === "sentence_start"
      )
    ).toHaveLength(3);
  });

  it("stops speaking at once when the agent fails mid-answer, and can speak again after", async () => {
    const out: Out[] = [];
    const aborted: boolean[] = [];
    const fake = createFakeVoice();
    const voice: VoiceProvider = {
      ...fake,
      synthesize: async (text, signal) => {
        const audio = await fake.synthesize(text, signal);
        signal.addEventListener("abort", () => aborted.push(true));
        return audio;
      },
    };
    const agent: AgentAdapter = {
      name: "fake",
      async *reply() {
        yield "The first sentence of a long answer is here. The second one follows it. ";
        await new Promise((resolve) => setTimeout(resolve, 30));
        throw new Error("agent crashed");
      },
    };
    const turn = new TurnController({
      voice,
      agent,
      sessionKey: "opencharm-c_1",
      send: (m) => out.push(m),
      sendAudio: (p) => out.push({ audio: p.length }),
      timeoutMs: 5000,
      // Playback is still going when the agent fails.
      sleep: (ms) =>
        new Promise((resolve) => setTimeout(resolve, Math.min(ms, 10))),
    });
    await speak(turn);
    const failedAt = out.findIndex(
      (m) => "op" in m && m.op === "face" && m.state === "failed"
    );
    expect(failedAt).toBeGreaterThan(-1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(out.slice(failedAt + 1)).toEqual([]);
    expect(aborted.length).toBeGreaterThan(0);
    expect(turn.busy).toBe(false);
    await turn.say("Back again.");
    expect(out.at(-1)).toMatchObject({ op: "face", state: "idle" });
  });

  it("ends the turn when the agent stalls after it started speaking, instead of staying busy", async () => {
    const agent: AgentAdapter = {
      name: "fake",
      async *reply(input) {
        yield "Here is the first part of it. ";
        await new Promise((_, reject) =>
          input.signal.addEventListener("abort", () =>
            reject(new Error("aborted"))
          )
        );
      },
    };
    const { turn, faces } = setup({ agent, timeoutMs: 100 });
    await speak(turn);
    expect(faces().at(-1)).toBe("failed");
    expect(turn.busy).toBe(false);
  });

  it("synthesizes only the sentence playing and the next one", async () => {
    let running = 0;
    let most = 0;
    const fake = createFakeVoice({ transcript: "count" });
    const voice: VoiceProvider = {
      ...fake,
      synthesize: async (text, signal) => {
        running += 1;
        most = Math.max(most, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        return fake.synthesize(text, signal);
      },
    };
    const agent = createFakeAgent({
      reply: () =>
        "One is here. Two is here. Three is here. Four is here. Five is here.",
    });
    const { turn } = setup({ voice, agent });
    await speak(turn);
    expect(most).toBeLessThanOrEqual(2);
  });
});

describe("replies as text (spec 003)", () => {
  it("shows each sentence for its reading time, with no speech and no audio", async () => {
    const out: Out[] = [];
    const pauses: number[] = [];
    const fake = createFakeVoice({ transcript: "what's on today" });
    let synthesized = 0;
    const turn = new TurnController({
      voice: {
        ...fake,
        synthesize: (text, signal) => {
          synthesized += 1;
          return fake.synthesize(text, signal);
        },
      },
      agent: createFakeAgent({
        reply: () =>
          "You have two meetings today. The first one is at nine with the whole design team.",
      }),
      sessionKey: "opencharm-c_1",
      send: (m) => out.push(m),
      sendAudio: (p) => out.push({ audio: p.length }),
      timeoutMs: 5000,
      sleep: (ms) => {
        pauses.push(ms);
        return Promise.resolve();
      },
      speakAloud: () => false,
    });
    await speak(turn);
    expect(synthesized).toBe(0);
    expect(out.some((m) => "audio" in m)).toBe(false);
    const kinds = out.map((m) =>
      "audio" in m
        ? "audio"
        : m.type === "tts"
          ? `tts:${m.state}`
          : m.type === "charm" && "state" in m
            ? `face:${m.state}`
            : m.type
    );
    expect(kinds).toEqual([
      "face:listening",
      "face:thinking",
      "stt",
      "tts:start",
      "tts:sentence_start",
      "tts:sentence_start",
      "tts:stop",
      "face:idle",
    ]);
    // Five words: the 2 s minimum; eleven words: about 3.7 s.
    expect(pauses).toEqual([2000, (11 / 3) * 1000]);
  });

  it("a press dismisses a reply being read", async () => {
    const reading = new TurnController({
      voice: createFakeVoice({ transcript: "hi" }),
      agent: createFakeAgent({
        reply: () => "A sentence that stays on screen for a while to be read.",
      }),
      sessionKey: "opencharm-c_1",
      send: () => undefined,
      sendAudio: () => undefined,
      timeoutMs: 5000,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      speakAloud: () => false,
    });
    reading.listenStart();
    reading.audio(Buffer.from([0xf8, 1, 2, 3]));
    const done = reading.listenStop();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reading.state).toBe("speaking");
    const before = Date.now();
    reading.abort();
    await done;
    expect(Date.now() - before).toBeLessThan(500);
    expect(reading.busy).toBe(false);
  });

  it("reading a long sentence doesn't run out the turn's clock, and the first clause isn't split off", async () => {
    const out: Out[] = [];
    const logs: Array<Record<string, unknown>> = [];
    const turn = new TurnController({
      voice: createFakeVoice({ transcript: "hi" }),
      agent: createFakeAgent({
        reply: () =>
          "Sure, here is a sentence that takes a while to read on the screen. And a second one.",
      }),
      sessionKey: "opencharm-c_1",
      send: (m) => out.push(m),
      sendAudio: () => undefined,
      timeoutMs: 100,
      // Each sentence stays longer than the whole clock.
      sleep: () => new Promise((resolve) => setTimeout(resolve, 250)),
      log: (entry) => logs.push(entry),
      speakAloud: () => false,
    });
    await speak(turn);
    const shown = out.flatMap((m) =>
      "type" in m && m.type === "tts" && m.state === "sentence_start"
        ? [m.text]
        : []
    );
    expect(shown).toEqual([
      "Sure, here is a sentence that takes a while to read on the screen.",
      "And a second one.",
    ]);
    expect(logs[0]).toMatchObject({ outcome: "done" });
  });
});

describe("typed questions (spec 013)", () => {
  it("go to the agent without listening, and the answer comes as text even when replies are spoken", async () => {
    const out: Out[] = [];
    const asked: string[] = [];
    const fake = createFakeVoice();
    let used = 0;
    const turn = new TurnController({
      voice: {
        ...fake,
        transcribe: () => {
          used += 1;
          return Promise.resolve("never");
        },
        synthesize: (text, signal) => {
          used += 1;
          return fake.synthesize(text, signal);
        },
      },
      agent: createFakeAgent({
        reply: (text) => {
          asked.push(text);
          return "Domani piove a Milano.";
        },
      }),
      sessionKey: "opencharm-c_1",
      send: (m) => out.push(m),
      sendAudio: (p) => out.push({ audio: p.length }),
      timeoutMs: 5000,
      sleep: () => Promise.resolve(),
      speakAloud: () => true,
    });
    await turn.typed("  Che tempo fa domani a Milano?  ");
    expect(asked).toEqual(["Che tempo fa domani a Milano?"]);
    expect(used).toBe(0);
    expect(
      out.some((m) => "audio" in m || ("type" in m && m.type === "stt"))
    ).toBe(false);
    expect(
      out
        .filter((m) => "type" in m && m.type === "tts")
        .map((m) => ("state" in m ? m.state : ""))
    ).toEqual(["start", "sentence_start", "stop"]);
  });
});

describe("pacing the reply's audio", () => {
  it("keeps the charm's player ahead through a long answer, though every sleep runs late", async () => {
    let t = 0;
    let firstAt: number | undefined;
    let sentMs = 0;
    let leastAhead = Infinity;
    const turn = new TurnController({
      voice: createFakeVoice({ transcript: "tell me" }),
      agent: createFakeAgent({
        reply: () =>
          "Here is one long sentence that goes on and on without a single stop, so that the charm has to keep speaking it for well over ten seconds while the timers that pace it run a little late every single time they fire",
      }),
      sessionKey: "opencharm-c_1",
      send: () => undefined,
      sendAudio: (packet) => {
        firstAt ??= t;
        // What the player still has queued when this packet arrives; below zero it ran dry.
        if (sentMs > 0)
          leastAhead = Math.min(leastAhead, sentMs - (t - firstAt));
        sentMs += opusPacketSamples48k(packet) / 48;
      },
      timeoutMs: 5000,
      now: () => t,
      // Real timers fire late; a few milliseconds each time.
      sleep: (ms) => {
        t += ms + 3;
        return Promise.resolve();
      },
    });
    await speak(turn);
    expect(sentMs).toBeGreaterThan(10_000);
    expect(leastAhead).toBeGreaterThan(0);
  });

  it("stays about the same distance ahead from one sentence to the next, so the captions keep up with the voice", async () => {
    let t = 0;
    let firstAt: number | undefined;
    let sentMs = 0;
    let mostAhead = 0;
    let lastPacketMs = 0;
    const turn = new TurnController({
      voice: createFakeVoice({ transcript: "tell me" }),
      agent: createFakeAgent({
        reply: () =>
          "Here is the first sentence of the answer. Then a second one follows it. A third sentence comes next. And a fourth one here. The fifth sentence ends it all.",
      }),
      sessionKey: "opencharm-c_1",
      send: () => undefined,
      sendAudio: (packet) => {
        firstAt ??= t;
        lastPacketMs = opusPacketSamples48k(packet) / 48;
        sentMs += lastPacketMs;
        mostAhead = Math.max(mostAhead, sentMs - (t - firstAt));
      },
      timeoutMs: 5000,
      now: () => t,
      sleep: (ms) => {
        t += ms + 3;
        return Promise.resolve();
      },
    });
    await speak(turn);
    expect(mostAhead).toBeLessThanOrEqual(250 + lastPacketMs);
  });
});
