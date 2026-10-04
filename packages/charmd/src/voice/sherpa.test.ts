import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readOggOpus } from "../audio/ogg-opus";
import { oggOpusToPcm, pcmToOggOpus } from "../audio/opus-codec";
import { VoiceNotReady, defaultModelsDir, modelPath } from "./models";
import { createParakeetListener, createSupertonicSpeaker } from "./sherpa";

const installed =
  existsSync(join(modelPath("parakeet"), "tokens.txt")) &&
  existsSync(join(modelPath("supertonic"), "tts.json"));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the local voice", () => {
  it("says a missing model is downloading, and starts the download, instead of failing silently", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oc-sherpa-"));
    // The download never finishes here: no network in tests.
    const fetch = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetch);
    try {
      const listener = createParakeetListener({ modelsDir: dir });
      await expect(listener.transcribe(Buffer.alloc(0))).rejects.toBeInstanceOf(
        VoiceNotReady
      );
      await expect(listener.transcribe(Buffer.alloc(0))).rejects.toThrow(
        /Parakeet \(listening\) is still downloading/
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Runs where the models are installed (`opencharm voice install`), e.g. the maintainer's Mac.
  it.skipIf(!installed)(
    "speaks with Supertonic and hears it back with Parakeet",
    async () => {
      const signal = new AbortController().signal;
      const ogg = await createSupertonicSpeaker({
        modelsDir: defaultModelsDir(),
      }).synthesize("Today is a good day to test the voice.", signal, "en");
      expect(readOggOpus(ogg).packets.length).toBeGreaterThan(20);
      // The charm sends 16 kHz: decode at 16 kHz and encode again, as its packets would be.
      const heard = await createParakeetListener().transcribe(
        pcmToOggOpus(oggOpusToPcm(ogg, 16000), 16000)
      );
      expect(heard.toLowerCase()).toContain("good day to test the voice");
    },
    60_000
  );
});
