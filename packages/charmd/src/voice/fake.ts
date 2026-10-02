import { pcmToOggOpus } from "../audio/opus-codec";
import type { VoiceProvider } from "./types";

type FakeVoiceOptions = { transcript?: string; fail?: boolean };

const SAMPLE_RATE = 24000;
const MS_PER_CHAR = 55;

// For tests and for trying the charm with no speech service: "hears" a fixed sentence and "speaks"
// a soft tone as long as the text would take to say.
function createFakeVoice(options: FakeVoiceOptions = {}): VoiceProvider {
  return {
    name: "fake",
    transcribe: () =>
      options.fail
        ? Promise.reject(new Error("The fake voice was told to fail"))
        : Promise.resolve(options.transcript ?? "hello"),
    synthesize: (text) => {
      const samples = Math.round(
        (text.length * MS_PER_CHAR * SAMPLE_RATE) / 1000
      );
      const pcm = Buffer.alloc(samples * 2);
      for (let i = 0; i < samples; i++)
        pcm.writeInt16LE(
          Math.round(Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) * 2000),
          i * 2
        );
      return Promise.resolve(pcmToOggOpus(pcm, SAMPLE_RATE));
    },
  };
}

export { createFakeVoice };
export type { FakeVoiceOptions };
