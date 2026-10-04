// Speaking that doesn't go silent (spec 003): when the chosen voice fails or, over the network, has no
// audio within 3 s (Microsoft's service is unofficial and may stop), the next one speaks that sentence.
// Once a voice's first packet is here, that sentence stays with it. After a failure the voice rests for a minute,
// so a whole reply doesn't wait on it sentence after sentence.
import { writeOggOpus } from "../audio/ogg-opus";
import { PacketStream, packetsOf } from "./packets";
import type { Speaker } from "./types";

type FallbackOptions = {
  timeoutMs?: number;
  restMs?: number;
  now?: () => number;
};

const FIRST_AUDIO_MS = 3000;
const REST_MS = 60_000;

async function firstWithin(
  packets: PacketStream,
  ms: number,
  name: string
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      packets.first(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${name} had no audio within ${ms} ms`)),
          ms
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function speakWithFallback(
  chain: Speaker[],
  options: FallbackOptions = {}
): Speaker {
  const [first] = chain;
  if (!first) throw new Error("No voice to speak with");
  if (chain.length === 1) return first;
  const now = options.now ?? Date.now;
  const resting = new Map<Speaker, number>();
  async function* stream(
    text: string,
    signal: AbortSignal,
    language?: string
  ): AsyncIterable<Buffer> {
    let lastError: unknown;
    for (const [index, speaker] of chain.entries()) {
      const last = index === chain.length - 1;
      if (!last && (resting.get(speaker) ?? 0) > now()) continue;
      const controller = new AbortController();
      const abort = () => controller.abort(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      const packets = new PacketStream(
        packetsOf(speaker, text, controller.signal, language)
      );
      try {
        // Only a voice over the network gets a deadline; one on this computer is slow, not gone.
        if (last || speaker.onDevice) await packets.first();
        else
          await firstWithin(
            packets,
            options.timeoutMs ?? FIRST_AUDIO_MS,
            speaker.name
          );
      } catch (error) {
        signal.removeEventListener("abort", abort);
        controller.abort(error);
        signal.throwIfAborted();
        lastError = error;
        resting.set(speaker, now() + (options.restMs ?? REST_MS));
        continue;
      }
      // Its first packet is here: the sentence stays with this voice, even if it fails later.
      try {
        yield* packets;
      } finally {
        signal.removeEventListener("abort", abort);
      }
      return;
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
  return {
    name: first.name,
    stream,
    async synthesize(text, signal, language) {
      const packets: Buffer[] = [];
      for await (const packet of stream(text, signal, language))
        packets.push(packet);
      return writeOggOpus(packets, { inputSampleRate: 24000 });
    },
    warm: async () => {
      await Promise.allSettled(
        chain.map((speaker) => speaker.warm?.() ?? Promise.resolve())
      );
    },
  };
}

export { speakWithFallback };
