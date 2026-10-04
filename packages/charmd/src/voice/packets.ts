// Speech as a stream of Opus packets (spec 003): a sentence starts playing when its first packet
// exists, not when the whole sentence is synthesized. A PacketStream starts reading its source at
// once and keeps what arrives, so sentences synthesize ahead while the one before plays.
import { readOggOpus } from "../audio/ogg-opus";
import type { Speaker } from "./types";

type Waiter = () => void;

function asError(problem: unknown): Error {
  if (problem instanceof Error) return problem;
  return new Error(typeof problem === "string" ? problem : "The voice failed");
}

class PacketStream implements AsyncIterable<Buffer> {
  readonly #packets: Buffer[] = [];
  #done = false;
  #error: Error | undefined;
  #waiters: Waiter[] = [];

  constructor(source: AsyncIterable<Buffer>) {
    void this.#pump(source);
  }

  async #pump(source: AsyncIterable<Buffer>): Promise<void> {
    try {
      for await (const packet of source) {
        this.#packets.push(packet);
        this.#wake();
      }
    } catch (error) {
      this.#error = asError(error);
    } finally {
      this.#done = true;
      this.#wake();
    }
  }

  #wake(): void {
    for (const waiter of this.#waiters.splice(0)) waiter();
  }

  #next(): Promise<void> {
    return new Promise((resolve) => this.#waiters.push(resolve));
  }

  // Resolves once the first packet is here; rejects if the voice failed or ended with nothing.
  async first(): Promise<void> {
    while (this.#packets.length === 0) {
      if (this.#error !== undefined) throw this.#error;
      if (this.#done) throw new Error("The voice produced no audio");
      await this.#next();
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Buffer> {
    let index = 0;
    for (;;) {
      if (index < this.#packets.length) {
        yield this.#packets[index++]!;
        continue;
      }
      if (this.#error !== undefined) throw this.#error;
      if (this.#done) return;
      await this.#next();
    }
  }
}

// A speaker that only returns whole files still fits: its packets arrive all at once.
function packetsOf(
  speaker: Pick<Speaker, "synthesize"> & Partial<Pick<Speaker, "stream">>,
  text: string,
  signal: AbortSignal,
  language?: string
): AsyncIterable<Buffer> {
  if (speaker.stream) return speaker.stream(text, signal, language);
  return (async function* () {
    yield* readOggOpus(await speaker.synthesize(text, signal, language))
      .packets;
  })();
}

// Pushed from callbacks (a WebSocket's events), read as an async iterable.
function createChannel<T>() {
  const items: T[] = [];
  let done = false;
  let error: Error | undefined;
  let waiter: Waiter | undefined;
  const wake = () => {
    waiter?.();
    waiter = undefined;
  };
  return {
    push(item: T) {
      items.push(item);
      wake();
    },
    end() {
      done = true;
      wake();
    },
    fail(problem: unknown) {
      error = asError(problem);
      done = true;
      wake();
    },
    async *[Symbol.asyncIterator](): AsyncIterator<T> {
      for (;;) {
        const item = items.shift();
        if (item !== undefined) {
          yield item;
          continue;
        }
        if (error !== undefined) throw error;
        if (done) return;
        await new Promise<void>((resolve) => (waiter = resolve));
      }
    },
  };
}

export { PacketStream, createChannel, packetsOf };
