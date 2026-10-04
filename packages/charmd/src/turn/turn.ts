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
};
type Stage = "stt" | "agent" | "tts";
type AskOptions = { yes?: string; no?: string; signal?: AbortSignal };

// A minute of speech at 60 ms per packet; longer holds are cut, not buffered forever.
const MAX_FRAMES = 1000;
// Send a few packets ahead of real time so the charm's player never runs dry.
const LEAD_FRAMES = 3;
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
    // The user is speaking for a few seconds anyway: a good moment for a slow agent to start up.
    this.#deps.agent.warm?.(this.#deps.sessionKey);
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
    return this.#run(frames);
  }

  async #run(frames: Buffer[]): Promise<void> {
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
    // The clock is for getting an answer started; once it speaks, a long answer may take its time
    // (a press stops it).
    let clockStopped = false;
    const stopClock = () => {
      clockStopped = true;
      clearTimeout(timer);
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
      const ogg = writeOggOpus(frames, { inputSampleRate: 16000 });
      heard = await Promise.race([
        inStage("stt", () => this.#deps.voice.transcribe(ogg, signal)),
        timeoutGuard,
      ]);
      timings.sttMs = now() - started;
      if (!live()) return;
      this.#deps.send({ type: "stt", text: heard });
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
          clearTimeout(timer);
          try {
            return await ask(text, { ...options, signal });
          } finally {
            if (!signal.aborted && !clockStopped) timer = startClock();
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
        stopClock
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
    onFirstAudio: () => void
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
      startUpTo(playing + LOOKAHEAD);
      wake();
    };
    const produce = (async () => {
      const splitter = new SentenceSplitter();
      await inStage("agent", async () => {
        for await (const chunk of source) {
          if (!going()) return;
          timings.agentFirstMs ??= now() - started;
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
          timings.firstAudioMs = now() - started;
          onFirstAudio();
          this.#deps.send({ type: "tts", state: "start" });
        }
        this.#deps.send({ type: "tts", state: "sentence_start", text });
        await inStage("tts", () => this.#sendPaced(packets, going));
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
    const timer = setTimeout(
      () => controller.abort(new TurnTimeout()),
      this.#deps.timeoutMs
    );
    const stopClock = () => clearTimeout(timer);
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
        stopClock
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
    live: () => boolean
  ): Promise<void> {
    const sleep = this.#deps.sleep ?? sleepMs;
    let index = 0;
    for await (const packet of packets) {
      if (!live()) return;
      this.#deps.sendAudio(packet);
      if (index++ >= LEAD_FRAMES - 1)
        await sleep(opusPacketSamples48k(packet) / 48);
    }
  }

  dispose(): void {
    this.#cancel();
    this.#state = "idle";
  }
}

export { TurnController };
export type { TurnDeps, TurnState };
