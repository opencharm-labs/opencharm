import { randomBytes } from "node:crypto";

import { AUDIO_DOWN, LIMITS } from "@opencharm-labs/protocol/constants";
import type {
  CharmBuild,
  ClientMessage,
  ServerMessage,
} from "@opencharm-labs/protocol/messages";
import { parseClientMessage } from "@opencharm-labs/protocol/parse";
import { fitUtf8 } from "@opencharm-labs/protocol/text";

import type { PairingRegistry } from "../auth/pairing";
import { generateToken, hashPin, hashToken, verifyPin } from "../auth/secrets";
import type { LookMessage } from "../look";
import type { CharmRecord, StateStore } from "../store/state-store";
import type { TurnController } from "../turn/turn";

type SessionState =
  "awaiting_hello" | "unpaired" | "locked" | "unlocked" | "closed";
type Outbound = {
  send: (message: ServerMessage) => void;
  sendAudio?: (packet: Buffer) => void;
  close: (code: number) => void;
};
type AskOptions = { yes?: string; no?: string; signal?: AbortSignal };
type TurnIo = {
  sessionKey: string;
  send: (message: ServerMessage) => void;
  sendAudio: (packet: Buffer) => void;
  // A question on the charm (decision layout); resolves false on no, silence, cancel or lock.
  ask: (text: string, options?: AskOptions) => Promise<boolean>;
  // What the charm said it is in its hello ("desktop", "emulator", …; spec 015), if it said.
  kind: () => string | undefined;
};
type PendingAsk = {
  id: string;
  settle: (yes: boolean) => void;
  drop: () => void;
};
type SessionDeps = {
  store: StateStore;
  pairing: PairingRegistry;
  connectionId: string;
  token?: string;
  outbound: Outbound;
  // Builds the voice turn for an unlocked charm (spec 003); absent in tests that only cover the guard.
  createTurn?: (io: TurnIo) => TurnController;
  askTimeoutMs?: number;
  // The charm's identity (spec 014), sent before every unlocked: the charm keeps it only in memory.
  look?: () => LookMessage;
};

const MAX_TRIES = 5;
// Silence on a question means no.
const ASK_TIMEOUT_MS = 30_000;
// Limits in UTF-8 bytes, as the charm counts them.
const MAX_ASK_TEXT = 200;
const MAX_ASK_LABEL = 12;
// WebSocket close codes: 1008 policy violation, 1009 too big, 4001 our "token no longer valid".
const CLOSE_POLICY = 1008;
const CLOSE_TOO_BIG = 1009;
const CLOSE_REVOKED = 4001;

function newCharmId(): string {
  return `c_${randomBytes(6).toString("hex")}`;
}

// One Session per WebSocket connection. It is a plain state machine: text and audio frames and
// admin actions go in, protocol messages come out, so every security rule is testable without sockets.
class Session {
  readonly connectionId: string;
  readonly sessionId = randomBytes(8).toString("hex");
  #state: SessionState = "awaiting_hello";
  #charmId: string | undefined;
  // What the charm said it runs, in its hello (spec 015); undefined for firmware that doesn't say.
  #build: CharmBuild | undefined;
  #queue: Promise<void> = Promise.resolve();
  #turn: TurnController | undefined;
  #asks: Promise<unknown> = Promise.resolve();
  #pendingAsk: PendingAsk | undefined;
  readonly #deps: SessionDeps;

  constructor(deps: SessionDeps) {
    this.#deps = deps;
    this.connectionId = deps.connectionId;
  }

  get state(): SessionState {
    return this.#state;
  }

  get build(): CharmBuild | undefined {
    return this.#build;
  }

  get charmId(): string | undefined {
    return this.#charmId;
  }

  #send(message: ServerMessage): void {
    if (this.#state !== "closed") this.#deps.outbound.send(message);
  }

  #endTurn(): void {
    this.#turn?.dispose();
    this.#turn = undefined;
  }

  #activeTurn(): TurnController | undefined {
    if (!this.#turn && this.#deps.createTurn && this.#charmId) {
      this.#turn = this.#deps.createTurn({
        sessionKey: `opencharm-${this.#charmId}`,
        send: (message) => this.#send(message),
        sendAudio: (packet) => {
          if (this.#state === "unlocked")
            this.#deps.outbound.sendAudio?.(packet);
        },
        ask: (text, options) => this.ask(text, options),
        kind: () => this.#build?.kind,
      });
    }
    return this.#turn;
  }

  #close(code: number): void {
    if (this.#state === "closed") return;
    this.#pendingAsk?.drop();
    this.#endTurn();
    this.#state = "closed";
    this.#deps.pairing.release(this.connectionId);
    this.#deps.outbound.close(code);
  }

  #charm(): CharmRecord | undefined {
    return this.#charmId ? this.#deps.store.find(this.#charmId) : undefined;
  }

  #sendLocked(): void {
    const charm = this.#charm();
    if (charm?.blocked) {
      this.#send({ type: "charm", op: "locked", reason: "blocked" });
    } else {
      this.#send({
        type: "charm",
        op: "locked",
        reason: "boot",
        tries_left: MAX_TRIES - (charm?.failedTries ?? 0),
      });
    }
  }

  #sendUnlocked(): void {
    const look = this.#deps.look?.();
    if (look) this.#send(look);
    this.#send({ type: "charm", op: "unlocked" });
    this.#activeTurn()?.warm();
  }

  #issuePairCode(): void {
    try {
      const { code, expiresIn } = this.#deps.pairing.issue(this.connectionId);
      this.#send({
        type: "charm",
        op: "pair_code",
        code,
        expires_in: expiresIn,
      });
    } catch {
      this.#close(CLOSE_POLICY);
    }
  }

  // Frames are handled one at a time: two unlock attempts can't race past the try counter.
  onText(raw: string): Promise<void> {
    this.#queue = this.#queue.then(() => this.#handleText(raw));
    return this.#queue;
  }

  async #handleText(raw: string): Promise<void> {
    if (this.#state === "closed") return;
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      this.#close(CLOSE_POLICY);
      return;
    }
    const message = parsed.message;
    if (this.#state === "awaiting_hello") {
      if (message.type !== "hello") {
        this.#close(CLOSE_POLICY);
        return;
      }
      this.#build = message.build;
      this.#onHello();
      return;
    }
    await this.#onMessage(message);
  }

  #onHello(): void {
    this.#send({
      type: "hello",
      transport: "websocket",
      session_id: this.sessionId,
      audio_params: AUDIO_DOWN,
      // Typed text (spec 013) is for the desktop charm only: a board has no keyboard.
      ...(this.#build?.kind === "desktop" ? { features: { text: true } } : {}),
    });
    const { token } = this.#deps;
    if (token === undefined) {
      this.#state = "unpaired";
      this.#issuePairCode();
      return;
    }
    const charm = this.#deps.store.findByTokenHash(hashToken(token));
    if (!charm) {
      this.#send({ type: "charm", op: "revoked" });
      this.#close(CLOSE_REVOKED);
      return;
    }
    this.#charmId = charm.id;
    this.#state = "locked";
    this.#sendLocked();
  }

  async #onMessage(message: ClientMessage): Promise<void> {
    if (message.type === "hello") return;
    if (this.#state === "unpaired") {
      this.#issuePairCode();
      return;
    }
    if (message.type === "charm" && message.op === "unlock") {
      await this.#onUnlock(message.pin);
      return;
    }
    if (this.#state !== "unlocked") {
      this.#sendLocked();
      return;
    }
    if (message.type === "charm" && message.op === "answer") {
      if (this.#pendingAsk?.id === message.id)
        this.#pendingAsk.settle(message.yes);
      return;
    }
    const turn = this.#activeTurn();
    if (!turn) return;
    if (message.type === "listen") {
      // The mic is open only while the key is held; "detect" (wake word) is not used by charms.
      if (message.state === "start") turn.listenStart();
      else if (message.state === "stop") void turn.listenStop();
    } else if (message.type === "abort") {
      turn.abort();
    } else if (message.type === "charm" && message.op === "text") {
      // Only the desktop charm has a keyboard (spec 013); a board's charm can't type.
      if (this.#build?.kind === "desktop") void turn.typed(message.text);
    }
  }

  async #onUnlock(pin: string): Promise<void> {
    if (this.#state === "unlocked") {
      this.#sendUnlocked();
      return;
    }
    const charm = this.#charm();
    if (!charm || charm.blocked) {
      this.#sendLocked();
      return;
    }
    if (await verifyPin(pin, charm.pinHash)) {
      this.#deps.store.put({ ...charm, failedTries: 0 });
      this.#state = "unlocked";
      this.#sendUnlocked();
      return;
    }
    const failedTries = charm.failedTries + 1;
    const blocked = failedTries >= MAX_TRIES;
    this.#deps.store.put({ ...charm, failedTries, blocked });
    this.#send(
      blocked
        ? { type: "charm", op: "locked", reason: "blocked" }
        : {
            type: "charm",
            op: "locked",
            reason: "wrong_pin",
            tries_left: MAX_TRIES - failedTries,
          }
    );
  }

  // Audio joins the same queue as text: a frame sent right after "listen start" must not overtake it.
  onBinary(frame: Buffer): Promise<void> {
    if (frame.byteLength > LIMITS.maxAudioFrameBytes) {
      this.#close(CLOSE_TOO_BIG);
      return Promise.resolve();
    }
    this.#queue = this.#queue.then(() => this.#handleBinary(frame));
    return this.#queue;
  }

  #handleBinary(frame: Buffer): void {
    if (this.#state === "closed") return;
    if (this.#state !== "unlocked") {
      if (this.#state === "locked") this.#sendLocked();
      return;
    }
    this.#activeTurn()?.audio(frame);
  }

  refreshPairCode(): void {
    if (this.#state === "unpaired") this.#issuePairCode();
  }

  async completePairing(name: string, pin: string): Promise<string> {
    if (this.#state !== "unpaired")
      throw new Error("This charm is not waiting to pair.");
    const token = generateToken();
    const record: CharmRecord = {
      id: newCharmId(),
      name,
      tokenHash: hashToken(token),
      pinHash: await hashPin(pin),
      failedTries: 0,
      blocked: false,
      createdAt: new Date().toISOString(),
    };
    this.#deps.store.put(record);
    this.#deps.pairing.release(this.connectionId);
    this.#charmId = record.id;
    this.#state = "locked";
    this.#send({ type: "charm", op: "paired", token });
    this.#sendLocked();
    return token;
  }

  // One question at a time: a second waits for the first to be answered.
  ask(text: string, options: AskOptions = {}): Promise<boolean> {
    const next = () => this.#askNow(text, options);
    const result = this.#asks.then(next, next);
    this.#asks = result;
    const { signal } = options;
    if (!signal) return result;
    // Waiting in line for an earlier question: a cancelled turn gives up at once (#askNow then
    // sees the abort and skips it).
    const cancelled = new Promise<boolean>((resolve) => {
      if (signal.aborted) resolve(false);
      signal.addEventListener("abort", () => resolve(false), { once: true });
    });
    return Promise.race([result, cancelled]);
  }

  #askNow(text: string, { yes, no, signal }: AskOptions): Promise<boolean> {
    if (this.#state !== "unlocked" || signal?.aborted)
      return Promise.resolve(false);
    const id = randomBytes(6).toString("hex");
    return new Promise((resolve) => {
      const finish = (answer: boolean, clearCharm: boolean) => {
        if (this.#pendingAsk?.id !== id) return;
        this.#pendingAsk = undefined;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (clearCharm) this.#send({ type: "charm", op: "ask_end", id });
        resolve(answer);
      };
      const onAbort = () => finish(false, true);
      const timer = setTimeout(
        () => finish(false, true),
        this.#deps.askTimeoutMs ?? ASK_TIMEOUT_MS
      );
      signal?.addEventListener("abort", onAbort, { once: true });
      this.#pendingAsk = {
        id,
        settle: (answer) => finish(answer, false),
        // The charm drops its question on a lock or a lost connection by itself.
        drop: () => finish(false, false),
      };
      this.#send({
        type: "charm",
        op: "ask",
        id,
        text: fitUtf8(text, MAX_ASK_TEXT),
        ...(yes ? { yes: fitUtf8(yes, MAX_ASK_LABEL) } : {}),
        ...(no ? { no: fitUtf8(no, MAX_ASK_LABEL) } : {}),
      });
    });
  }

  lockRemote(): void {
    if (this.#state !== "unlocked") return;
    this.#pendingAsk?.drop();
    this.#endTurn();
    this.#state = "locked";
    this.#send({ type: "charm", op: "locked", reason: "remote" });
  }

  unlockByAdmin(): void {
    const charm = this.#charm();
    if (charm)
      this.#deps.store.put({ ...charm, blocked: false, failedTries: 0 });
    if (this.#state === "locked") {
      this.#state = "unlocked";
      this.#sendUnlocked();
    }
  }

  // A locked charm gets the new look with its next unlock instead.
  sendLook(look: LookMessage): void {
    if (this.#state === "unlocked") this.#send(look);
  }

  // The dev commands, and the agent's charm tools (opencharm mcp). During a turn they go through the
  // turn: a face is kept when it ends, a question pauses its clock, speaking over it is refused.
  devFace(state: string, text?: string): void {
    if (this.#state !== "unlocked")
      throw new Error("The charm must be unlocked first.");
    const line = text ? fitUtf8(text, MAX_ASK_TEXT) : undefined;
    if (this.#turn?.busy) {
      this.#turn.showFace(state, line);
      return;
    }
    this.#send({
      type: "charm",
      op: "face",
      state,
      ...(line ? { text: line } : {}),
    });
  }

  devSay(text: string): void {
    if (this.#state !== "unlocked")
      throw new Error("The charm must be unlocked first.");
    const turn = this.#activeTurn();
    if (!turn) throw new Error("This charmd has no voice configured.");
    if (turn.busy)
      throw new Error(
        "The charm is in the middle of a turn: put this in your reply instead."
      );
    void turn.say(text).catch(() => undefined);
  }

  devAsk(text: string, options: AskOptions = {}): Promise<boolean> {
    if (this.#state !== "unlocked")
      return Promise.reject(new Error("The charm must be unlocked first."));
    return this.#turn ? this.#turn.ask(text, options) : this.ask(text, options);
  }

  revoke(): void {
    this.#send({ type: "charm", op: "revoked" });
    this.#close(CLOSE_REVOKED);
  }

  closed(): void {
    if (this.#state === "closed") return;
    this.#pendingAsk?.drop();
    this.#endTurn();
    this.#state = "closed";
    this.#deps.pairing.release(this.connectionId);
  }
}

export { Session };
export type { AskOptions, Outbound, SessionDeps, SessionState, TurnIo };
