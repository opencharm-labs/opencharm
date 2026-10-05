import { describe, expect, it } from "vitest";

import { readOggOpus, writeOggOpus } from "../audio/ogg-opus";
import { speakWithFallback } from "./speak";
import type { Speaker } from "./types";

function speaker(
  name: string,
  behave: (text: string, signal: AbortSignal) => Promise<Buffer>
): Speaker & { calls: string[] } {
  const calls: string[] = [];
  return {
    name,
    calls,
    synthesize: (text, signal, language) => {
      calls.push(`${text}/${language ?? "-"}`);
      return behave(text, signal);
    },
  };
}

// A one-packet Ogg file whose packet carries a tag, to tell which voice spoke.
const ok = (tag: string) => () =>
  Promise.resolve(
    writeOggOpus([Buffer.concat([Buffer.from([0xf8]), Buffer.from(tag)])], {
      inputSampleRate: 24000,
    })
  );
const tagOf = (ogg: Buffer) =>
  readOggOpus(ogg).packets[0]!.subarray(1).toString();
const fail = () => Promise.reject(new Error("refused"));
const never = (_: string, signal: AbortSignal) =>
  new Promise<Buffer>((_, reject) =>
    signal.addEventListener("abort", () =>
      reject(
        signal.reason instanceof Error ? signal.reason : new Error("aborted")
      )
    )
  );

describe("speaking with a fallback", () => {
  it("uses the chosen voice, with the reply's language, while it works", async () => {
    const main = speaker("microsoft", ok("ms"));
    const local = speaker("local", ok("local"));
    const voice = speakWithFallback([main, local]);
    expect(
      tagOf(await voice.synthesize("Ciao", new AbortController().signal, "it"))
    ).toBe("ms");
    expect(main.calls).toEqual(["Ciao/it"]);
    expect(local.calls).toEqual([]);
  });

  it("gets the chosen voice ready ahead, but not while it rests after failing", async () => {
    let clock = 0;
    let primed = 0;
    const main = {
      ...speaker("microsoft", fail),
      prime: () => {
        primed += 1;
      },
    };
    const voice = speakWithFallback([main, speaker("local", ok("local"))], {
      now: () => clock,
    });
    voice.prime?.();
    expect(primed).toBe(1);
    await voice.synthesize("One", new AbortController().signal);
    voice.prime?.();
    expect(primed).toBe(1);
    clock = 61_000;
    voice.prime?.();
    expect(primed).toBe(2);
  });

  it("speaks the sentence with the next voice when the chosen one fails, then rests it for a minute", async () => {
    let clock = 0;
    const main = speaker("microsoft", fail);
    const local = speaker("local", ok("local"));
    const voice = speakWithFallback([main, local], { now: () => clock });
    const signal = new AbortController().signal;
    expect(tagOf(await voice.synthesize("One", signal))).toBe("local");
    expect(tagOf(await voice.synthesize("Two", signal))).toBe("local");
    expect(main.calls).toEqual(["One/-"]);
    clock = 61_000;
    await voice.synthesize("Three", signal);
    expect(main.calls).toEqual(["One/-", "Three/-"]);
  });

  it("gives up on a voice that takes too long", async () => {
    const voice = speakWithFallback(
      [speaker("microsoft", never), speaker("local", ok("local"))],
      { timeoutMs: 20 }
    );
    expect(
      tagOf(await voice.synthesize("Hi", new AbortController().signal))
    ).toBe("local");
  });

  it("fails with the last voice's error when none can speak", async () => {
    const voice = speakWithFallback([
      speaker("a", fail),
      speaker("b", () => Promise.reject(new Error("b broke"))),
    ]);
    await expect(
      voice.synthesize("Hi", new AbortController().signal)
    ).rejects.toThrow(/b broke/);
  });

  it("stops at once when the turn is cancelled instead of trying the next voice", async () => {
    const local = speaker("local", ok("local"));
    const voice = speakWithFallback([speaker("microsoft", never), local]);
    const controller = new AbortController();
    const pending = voice.synthesize("Hi", controller.signal);
    controller.abort(new Error("cancelled"));
    await expect(pending).rejects.toThrow(/cancelled/);
    expect(local.calls).toEqual([]);
  });

  it("keeps a sentence with the voice that started it: a failure after its first audio isn't replayed", async () => {
    const half: Speaker = {
      name: "microsoft",
      synthesize: () => Promise.reject(new Error("unused")),
      async *stream() {
        yield await Promise.resolve(Buffer.from([0xf8, 1]));
        yield Buffer.from([0xf8, 2]);
        throw new Error("closed mid-sentence");
      },
    };
    const local = speaker("local", ok("local"));
    const voice = speakWithFallback([half, local]);
    const got: number[] = [];
    await expect(
      (async () => {
        for await (const packet of voice.stream!(
          "Hi",
          new AbortController().signal
        ))
          got.push(packet[1]!);
      })()
    ).rejects.toThrow(/closed mid-sentence/);
    expect(got).toEqual([1, 2]);
    expect(local.calls).toEqual([]);
  });

  it("gives a voice on this computer the time it needs: no first-audio deadline", async () => {
    const slow: Speaker = {
      ...speaker(
        "local",
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(ok("slow")() as unknown as Buffer), 60)
          )
      ),
      onDevice: true,
    };
    const voice = speakWithFallback([slow, speaker("system", ok("system"))], {
      timeoutMs: 10,
    });
    expect(
      tagOf(await voice.synthesize("Hi", new AbortController().signal))
    ).toBe("slow");
  });
});
