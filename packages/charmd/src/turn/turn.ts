import type { ServerMessage } from "@opencharm-labs/protocol/messages";

import type { AgentAdapter } from "../agent/types";
import { opusPacketSamples48k, writeOggOpus } from "../audio/ogg-opus";
import { guessLanguage } from "../voice/language";
import { VoiceNotReady } from "../voice/models";
import { PacketStream, packetsOf } from "../voice/packets";
import type { VoiceProvider } from "../voice/types";
import { ACP_AGENTS } from "../agent/acp-agents";
import { SentenceSplitter, cleanForSpeech } from "./sentences";

type TurnState = "idle" | "listening" | "thinking" | "speaking";
type TurnDeps = {
  voice: VoiceProvider;
  agent: AgentAdapter;
  sessionKey: string;
  send: (message: ServerMessage) => void;
  sendAudio: (packet: Buffer) => void;
  timeoutMs: number;
  log?: (entry: Record<string, unknown>) => void;
  logTranscripts?: boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  // A question on the charm (the session's ask); absent when there's no charm to ask.
  ask?: (text: string, options?: AskOptions) => Promise<boolean>;
  // Asked at the start of each turn: false shows the reply as text, with no speech (spec 003).
  speakAloud?: () => boolean;
};
type Stage = "stt" | "agent" | "tts";
type AskOptions = { yes?: string; no?: string; signal?: AbortSignal };

// A minute of speech at 60 ms per packet; longer holds are cut, not buffered forever.
const MAX_FRAMES = 1000;
// How far ahead of real time the charm's player is kept, so a late timer or a busy moment doesn't run
// it dry (each gap is a click).
const LEAD_MS = 250;
// Text-only replies: each sentence stays for about its reading time (3 words a second, at least 2 s).
const READING_WORDS_PER_SECOND = 3;
const MIN_READING_MS = 2000;
// Sentences synthesizing at once: the one playing and the next, so the next is ready in time without
// a long reply opening a connection (or a local job) per sentence.
const LOOKAHEAD = 2;
const AGENT_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(ACP_AGENTS).map(([name, agent]) => [name, agent.label])
  ),
};

class TurnTimeout extends Error {}

class StageError extends Error {
  constructor(
    readonly stage: Stage,
    cause: unknown
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}

function readingMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_READING_MS, (words / READING_WORDS_PER_SECOND) * 1000);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function inStage<T>(stage: Stage, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw error instanceof TurnTimeout ? error : new StageError(stage, error);
  }
}

// One turn = hold the key, speak, release, hear the answer. It only moves audio and text: what to
// answer and how is the agent's business. A generation number makes sure a cancelled turn never
// sends anything after a newer one has started.
class TurnController {
  #state: TurnState = "idle";
  #frames: Buffer[] = [];
  #generation = 0;
  #controller: AbortController | undefined;
  #speaking = false;
  // A question on the charm hides what's being read: a sentence's reading time waits for it (the
  // charm keeps the sentence and shows it again when the question ends). Questions can queue.
  #questions = 0;
  #questionsEnd: Promise<void> | undefined;
  #endQuestions = () => {};
  readonly #questionStarts = new Set<() => void>();
  // When the charm's player will have played all the audio of this reply (#sendPaced).
  #playedBy = 0;
  // While a turn runs: how a question pauses its clock; and a face a tool asked to keep after it.
  #asking:
    ((text: string, options: AskOptions) => Promise<boolean>) | undefined;
  #endFace: { state: string; text?: string } | undefined;
  readonly #deps: TurnDeps;

  constructor(deps: TurnDeps) {
    this.#deps = deps;
  }

  get state(): TurnState {
    return this.#state;
  }

  #face(state: string, text?: string): void {
    this.#deps.send({
      type: "charm",
      op: "face",
      state,
      ...(text ? { text } : {}),
    });
  }

  get busy(): boolean {
    return this.#state !== "idle";
  }

  // A face from the agent's tools: shown now and, during a turn, kept when the turn ends.
  showFace(state: string, text?: string): void {
    this.#face(state, text);
    if (this.busy) this.#endFace = { state, ...(text ? { text } : {}) };
  }

  // A question from the agent's tools: during a turn it pauses the turn's clock and is cancelled
  // with the turn, like a permission question.
  ask(text: string, options: AskOptions = {}): Promise<boolean> {
    if (this.#asking) return this.#asking(text, options);
    return this.#deps.ask
      ? this.#deps.ask(text, options)
      : Promise.resolve(false);
  }

  #cancel(): void {
    this.#endFace = undefined;
    this.#generation += 1;
    this.#controller?.abort();
    this.#controller = undefined;
    if (this.#speaking) this.#deps.send({ type: "tts", state: "stop" });
    this.#speaking = false;
  }

  // A charm just unlocked: start the agent and load the voice now, not on the first question.
  warm(): void {
    this.#deps.agent.warm?.(this.#deps.sessionKey);
    void this.#deps.voice.warm?.().catch(() => undefined);
  }

  listenStart(): void {
    if (this.#state === "thinking" || this.#state === "speaking")
      this.#cancel();
    this.#state = "listening";
    this.#frames = [];
    this.#face("listening");
    // The user is speaking for a few seconds anyway: a good moment for a slow agent to start up,
    // and for the voice to get ready to answer (when the answer will be spoken).
    this.#deps.agent.warm?.(this.#deps.sessionKey);
    if (this.#deps.speakAloud?.() ?? true) this.#deps.voice.prime?.();
  }

  audio(frame: Buffer): void {
    if (this.#state === "listening" && this.#frames.length < MAX_FRAMES)
      this.#frames.push(frame);
  }

  abort(): void {
    if (this.#state === "idle") return;
    this.#cancel();
    this.#state = "idle";
    this.#face("idle");
  }

  listenStop(): Promise<void> {
    if (this.#state !== "listening") return Promise.resolve();
    const frames = this.#frames;
    this.#frames = [];
    if (frames.length === 0) {
      this.#state = "idle";
      this.#face("idle");
      return Promise.resolve();
    }
    return this.#run({ frames });
  }

  // Typed text from the desktop charm (spec 013): no listening, and the answer comes as text, the way
  // it was asked (spec 003). A turn in progress is cancelled, as a new key hold would.
  typed(text: string): Promise<void> {
    if (this.busy) this.#cancel();
    return this.#run({ text: text.trim() });
  }

  async #run(input: { frames: Buffer[] } | { text: string }): Promise<void> {
    const generation = ++this.#generation;
    const live = () => this.#generation === generation;
    const controller = new AbortController();
    this.#controller = controller;
    const { signal } = controller;
    const now = this.#deps.now ?? Date.now;
    const started = now();
    const timings: Record<string, number> = {};
    let heard = "";
    let said = "";
    let outcome = "done";
    const startClock = () =>
      setTimeout(
        () => controller.abort(new TurnTimeout()),
        this.#deps.timeoutMs
      );
    let timer = startClock();
    // Until the first audio the clock times getting an answer started; from then on it times
    // silence: anything from the agent or the voice resets it, so a long answer plays to the end but
    // an agent or a voice that stalls mid-answer still ends the turn.
    let speakingStarted = false;
    let asking = false;
    let reading = false;
    const restartClock = () => {
      clearTimeout(timer);
      timer = startClock();
    };
    const clock = {
      started: () => {
        speakingStarted = true;
        restartClock();
      },
      touch: () => {
        if (speakingStarted && !asking && !reading) restartClock();
      },
      // Reading a sentence is activity too: no clock while it's on screen.
      pause: () => {
        reading = true;
        clearTimeout(timer);
      },
      resume: () => {
        reading = false;
        restartClock();
      },
    };
    const timeoutGuard = new Promise<never>((_, reject) =>
      signal.addEventListener("abort", () => {
        if (signal.reason instanceof TurnTimeout) reject(signal.reason);
      })
    );
    timeoutGuard.catch(() => undefined);

    this.#state = "thinking";
    this.#face("thinking");
    try {
      if ("text" in input) {
        heard = input.text;
      } else {
        const ogg = writeOggOpus(input.frames, { inputSampleRate: 16000 });
        heard = await Promise.race([
          inStage("stt", () => this.#deps.voice.transcribe(ogg, signal)),
          timeoutGuard,
        ]);
        timings.sttMs = now() - started;
        if (!live()) return;
        this.#deps.send({ type: "stt", text: heard });
      }
      if (!heard) {
        outcome = "nothing-heard";
        this.#state = "idle";
        this.#face("idle");
        return;
      }

      // Errors from the agent surface while its stream is read, inside #speak ("agent" stage).
      const ask = this.#deps.ask;
      const label = AGENT_LABELS[this.#deps.agent.name] ?? "Your agent";
      if (ask)
        this.#asking = async (text, options) => {
          asking = true;
          clearTimeout(timer);
          if (this.#questions++ === 0) {
            this.#questionsEnd = new Promise<void>((resolve) => {
              this.#endQuestions = resolve;
            });
            for (const notify of this.#questionStarts) notify();
          }
          try {
            return await ask(text, { ...options, signal });
          } finally {
            asking = false;
            if (--this.#questions === 0) {
              this.#questionsEnd = undefined;
              this.#endQuestions();
            }
            if (!signal.aborted) timer = startClock();
          }
        };
      const reply = this.#deps.agent.reply({
        sessionKey: this.#deps.sessionKey,
        text: heard,
        signal,
        ...(ask
          ? {
              // The person gets the question's own 30 s; the turn's clock restarts after.
              ask: (action: string) => this.ask(`${label} wants to ${action}.`),
            }
          : {}),
      });
      said = await this.#speak(
        reply,
        signal,
        live,
        timings,
        started,
        timeoutGuard,
        guessLanguage(heard) ?? this.#deps.voice.language ?? "en",
        clock,
        // It answers the way it was asked: typed gets text.
        !("text" in input) && (this.#deps.speakAloud?.() ?? true)
      );
      if (!live()) return;
      if (this.#speaking) this.#deps.send({ type: "tts", state: "stop" });
      this.#speaking = false;
      this.#state = "idle";
      const end = this.#endFace ?? { state: "idle" };
      this.#endFace = undefined;
      this.#face(end.state, end.text);
    } catch (error) {
      // Whichever half failed (the agent or the voice), the other stops too.
      if (!signal.aborted) controller.abort(error);
      outcome =
        error instanceof TurnTimeout
          ? "timeout"
          : error instanceof StageError
            ? `${error.stage}-error`
            : "error";
      if (!live()) return;
      if (this.#speaking) this.#deps.send({ type: "tts", state: "stop" });
      this.#speaking = false;
      this.#state = "idle";
      this.#face("failed", this.#failureLine(error));
    } finally {
      clearTimeout(timer);
      if (live()) {
        this.#controller = undefined;
        this.#asking = undefined;
        this.#endFace = undefined;
      }
      this.#deps.log?.({
        event: "turn",
        session: this.#deps.sessionKey,
        outcome: live() ? outcome : "cancelled",
        ...timings,
        totalMs: now() - started,
        ...("text" in input ? { typed: true } : {}),
        ...(this.#deps.logTranscripts ? { heard, said: said.trim() } : {}),
      });
    }
  }

  // Speaks a stream of text sentence by sentence: synthesis of the next sentence overlaps playback of
  // the current one, so the first words play while the rest is still being written.
  async #speak(
    source: AsyncIterable<string>,
    signal: AbortSignal,
    live: () => boolean,
    timings: Record<string, number>,
    started: number,
    timeoutGuard: Promise<never>,
    language: string,
    clock: {
      started: () => void;
      touch: () => void;
      pause: () => void;
      resume: () => void;
    },
    aloud: boolean
  ): Promise<string> {
    const now = this.#deps.now ?? Date.now;
    const going = () => live() && !signal.aborted;
    // Each sentence is spoken in its own language when it shows one, else in the one before it.
    let speaking = language;
    // The sentence playing and the next one synthesize; each plays from its first packet.
    const queue: Array<{
      text: string;
      language: string;
      packets?: PacketStream;
    }> = [];
    let playing = 0;
    const startUpTo = (end: number) => {
      for (let i = playing; i < Math.min(end, queue.length); i++) {
        const item = queue[i]!;
        item.packets ??= new PacketStream(
          packetsOf(this.#deps.voice, item.text, signal, item.language)
        );
      }
    };
    let wake: () => void = () => undefined;
    let sourceDone = false;
    let said = "";
    const enqueue = (sentence: string) => {
      const text = cleanForSpeech(sentence);
      if (!text) return;
      said += `${text} `;
      speaking = guessLanguage(text) ?? speaking;
      const sentenceLanguage = speaking;
      timings.firstSentenceMs ??= now() - started;
      queue.push({ text, language: sentenceLanguage });
      if (aloud) startUpTo(playing + LOOKAHEAD);
      wake();
    };
    const produce = (async () => {
      // An early first clause only helps audio start sooner; as text it would flash up on its own.
      const splitter = new SentenceSplitter({ firstClause: aloud });
      await inStage("agent", async () => {
        for await (const chunk of source) {
          if (!going()) return;
          timings.agentFirstMs ??= now() - started;
          clock.touch();
          for (const sentence of splitter.push(chunk)) enqueue(sentence);
        }
      });
      for (const sentence of splitter.flush()) enqueue(sentence);
    })().finally(() => {
      sourceDone = true;
      wake();
    });
    produce.catch(() => undefined);
    const play = async () => {
      for (;;) {
        if (!going()) return;
        if (playing >= queue.length) {
          if (sourceDone) return;
          await new Promise<void>((resolve) => (wake = resolve));
          continue;
        }
        if (!aloud) {
          await this.#showForReading(
            queue[playing]!.text,
            signal,
            going,
            clock,
            timings,
            started
          );
          playing += 1;
          continue;
        }
        startUpTo(playing + LOOKAHEAD);
        const { text, packets } = queue[playing]!;
        if (!packets) throw new Error("A sentence wasn't started");
        await Promise.race([
          inStage("tts", () => packets.first()),
          timeoutGuard,
        ]);
        if (!going()) return;
        if (!this.#speaking) {
          this.#speaking = true;
          this.#state = "speaking";
          this.#playedBy = 0;
          timings.firstAudioMs = now() - started;
          clock.started();
          this.#deps.send({ type: "tts", state: "start" });
        }
        this.#deps.send({ type: "tts", state: "sentence_start", text });
        await Promise.race([
          inStage("tts", () => this.#sendPaced(packets, going, clock.touch)),
          timeoutGuard,
        ]);
        playing += 1;
      }
    };
    await Promise.all([Promise.race([produce, timeoutGuard]), play()]);
    return said.trim();
  }

  // Speaks text directly: the dev command today, the agent's charm.say tool later.
  async say(text: string): Promise<void> {
    // Speaking over a turn would cancel the very answer that asked for it.
    if (this.busy)
      throw new Error(
        "The charm is in the middle of a turn: put this in your reply instead."
      );
    const generation = ++this.#generation;
    const live = () => this.#generation === generation;
    const controller = new AbortController();
    this.#controller = controller;
    const startClock = () =>
      setTimeout(
        () => controller.abort(new TurnTimeout()),
        this.#deps.timeoutMs
      );
    let timer = startClock();
    // As in a turn: from the first audio on, the clock times silence.
    const restartClock = () => {
      clearTimeout(timer);
      timer = startClock();
    };
    let reading = false;
    const clock = {
      started: restartClock,
      touch: () => {
        if (!reading) restartClock();
      },
      pause: () => {
        reading = true;
        clearTimeout(timer);
      },
      resume: () => {
        reading = false;
        restartClock();
      },
    };
    const timeoutGuard = new Promise<never>((_, reject) =>
      controller.signal.addEventListener("abort", () => {
        if (controller.signal.reason instanceof TurnTimeout)
          reject(controller.signal.reason);
      })
    );
    timeoutGuard.catch(() => undefined);
    async function* once() {
      yield await Promise.resolve(text);
    }
    try {
      await this.#speak(
        once(),
        controller.signal,
        live,
        {},
        Date.now(),
        timeoutGuard,
        guessLanguage(text) ?? this.#deps.voice.language ?? "en",
        clock,
        this.#deps.speakAloud?.() ?? true
      );
      if (!live()) return;
      if (this.#speaking) this.#deps.send({ type: "tts", state: "stop" });
      this.#speaking = false;
      this.#state = "idle";
      this.#face("idle");
    } catch (error) {
      if (!controller.signal.aborted) controller.abort(error);
      if (!live()) return;
      if (this.#speaking) this.#deps.send({ type: "tts", state: "stop" });
      this.#speaking = false;
      this.#state = "idle";
      this.#face("failed", this.#failureLine(error));
    } finally {
      clearTimeout(timer);
    }
  }

  // A text-only reply (spec 003): the same speech messages with no audio, so the charm shows its
  // speech layout; each sentence stays for its reading time, and a press dismisses it (abort).
  async #showForReading(
    text: string,
    signal: AbortSignal,
    going: () => boolean,
    clock: {
      started: () => void;
      touch: () => void;
      pause: () => void;
      resume: () => void;
    },
    timings: Record<string, number>,
    started: number
  ): Promise<void> {
    if (!going()) return;
    if (!this.#speaking) {
      this.#speaking = true;
      this.#state = "speaking";
      timings.firstTextMs = (this.#deps.now ?? Date.now)() - started;
      clock.started();
      this.#deps.send({ type: "tts", state: "start" });
    }
    const sleep = this.#deps.sleep ?? sleepMs;
    const now = this.#deps.now ?? Date.now;
    const aborted = new Promise<"aborted">((resolve) =>
      signal.addEventListener("abort", () => resolve("aborted"), {
        once: true,
      })
    );
    this.#deps.send({ type: "tts", state: "sentence_start", text });
    clock.pause();
    // While a question is up the charm shows it, not this sentence (it keeps the sentence and puts
    // it back after): the reading time waits, and goes on with what it had left.
    let remaining = readingMs(text);
    while (going()) {
      if (this.#questionsEnd) {
        await Promise.race([this.#questionsEnd, aborted]);
        continue;
      }
      const from = now();
      let notify = () => {};
      const question = new Promise<"question">((resolve) => {
        notify = () => resolve("question");
      });
      this.#questionStarts.add(notify);
      const outcome = await Promise.race([
        sleep(remaining).then(() => "read" as const),
        aborted,
        question,
      ]);
      this.#questionStarts.delete(notify);
      if (outcome !== "question") break;
      remaining = Math.max(0, remaining - (now() - from));
    }
    clock.resume();
  }

  #failureLine(error: unknown): string {
    if (error instanceof TurnTimeout) return "That took too long.";
    // A model still downloading says how far it got ("Parakeet (listening) is still downloading (45%)").
    if (error instanceof StageError && error.cause instanceof VoiceNotReady)
      return error.cause.message;
    if (error instanceof StageError && error.stage === "stt")
      return "I couldn't hear that.";
    if (error instanceof StageError && error.stage === "tts")
      return "I couldn't speak that.";
    return `Can't reach ${AGENT_LABELS[this.#deps.agent.name] ?? "your agent"}`;
  }

  async #sendPaced(
    packets: AsyncIterable<Buffer>,
    live: () => boolean,
    onPacket: () => void
  ): Promise<void> {
    const sleep = this.#deps.sleep ?? sleepMs;
    const now = this.#deps.now ?? Date.now;
    // Paced on the clock, across the reply's sentences: adding up each packet's sleep let every late
    // timer eat into the lead (20 ms packets ran dry within seconds), and starting each sentence
    // afresh forgot what the player still had, so the lead grew by a sentence's burst each time.
    for await (const packet of packets) {
      if (!live()) return;
      this.#deps.sendAudio(packet);
      onPacket();
      this.#playedBy =
        Math.max(this.#playedBy, now()) + opusPacketSamples48k(packet) / 48;
      const wait = this.#playedBy - LEAD_MS - now();
      if (wait > 0) await sleep(wait);
    }
  }

  dispose(): void {
    this.#cancel();
    this.#state = "idle";
  }
}

export { TurnController };
export type { TurnDeps, TurnState };
