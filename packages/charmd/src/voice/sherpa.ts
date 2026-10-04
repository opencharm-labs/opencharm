// The local voice (spec 003): sherpa-onnx inside charmd, Parakeet listening and Supertonic speaking.
// The native module and the models load once and stay in memory; both run off the main thread, so a
// turn never stalls the audio of another. charmd still starts when the module can't load: only this
// voice fails, with a message saying why.
import { createRequire } from "node:module";
import { join } from "node:path";

import { oggOpusToPcm, pcmToOggOpus } from "../audio/opus-codec";
import {
  VoiceNotReady,
  MODELS,
  RETRY_MS,
  defaultModelsDir,
  installModel,
  modelState,
  type ModelId,
} from "./models";

type SherpaAudio = { samples: Float32Array; sampleRate: number };
type SherpaStream = { acceptWaveform: (wave: SherpaAudio) => void };
type SherpaRecognizer = {
  createStream: () => SherpaStream;
  decodeAsync: (stream: SherpaStream) => Promise<{ text?: string }>;
};
type SherpaTts = {
  sampleRate: number;
  generateAsync: (request: {
    text: string;
    generationConfig: unknown;
    onProgress?: () => number | boolean;
  }) => Promise<SherpaAudio>;
};
type SherpaResampler = { flush: (samples: Float32Array) => Float32Array };
type Sherpa = {
  OfflineRecognizer: {
    createAsync: (config: unknown) => Promise<SherpaRecognizer>;
  };
  OfflineTts: { createAsync: (config: unknown) => Promise<SherpaTts> };
  GenerationConfig: new (options: unknown) => unknown;
  LinearResampler: new (from: number, to: number) => SherpaResampler;
};
type LocalOptions = { modelsDir?: string; threads?: number };
type SupertonicOptions = LocalOptions & { speaker?: number };

// The languages Supertonic 3 speaks that charmd can tell apart (voice/language.ts); others get English.
const SUPERTONIC_LANGUAGES = new Set(["en", "it", "es", "fr", "de", "pt"]);
// The maintainer's pick in the voice spike (packages/charmd/README.md).
const DEFAULT_SPEAKER = 5;
const OUTPUT_RATE = 24000;

let sherpa: Sherpa | undefined;

function loadSherpa(): Sherpa {
  if (sherpa) return sherpa;
  try {
    sherpa = createRequire(import.meta.url)("sherpa-onnx-node") as Sherpa;
    return sherpa;
  } catch (error) {
    throw new Error(
      `The local voice can't run on this computer: sherpa-onnx didn't load (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`,
      { cause: error }
    );
  }
}

// Starts the download when the model is missing and says how far it got; resolves to the model's
// folder once it's there.
function ready(id: ModelId, dir: string): string {
  const state = modelState(id, dir);
  if (state.state === "ready") return join(dir, MODELS[id].folder);
  // A failed download says why, and waits a while before trying again.
  if (state.state === "failed" && Date.now() - state.at < RETRY_MS)
    throw new VoiceNotReady(
      `Couldn't get ${MODELS[id].label}: ${state.error}`.slice(0, 160)
    );
  if (state.state !== "downloading")
    installModel(id, { dir }).catch(() => undefined);
  const now = modelState(id, dir);
  const percent =
    now.state === "downloading" && now.total
      ? ` (${Math.floor((now.received * 100) / now.total)}%)`
      : "";
  throw new VoiceNotReady(`${MODELS[id].label} is still downloading${percent}`);
}

function toFloat(pcm: Buffer): Float32Array {
  const out = new Float32Array(pcm.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = pcm.readInt16LE(i * 2) / 32768;
  return out;
}

function toPcm(samples: Float32Array): Buffer {
  const out = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++)
    out.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, samples[i] ?? 0)) * 32767),
      i * 2
    );
  return out;
}

function createParakeetListener(options: LocalOptions = {}) {
  const dir = options.modelsDir ?? defaultModelsDir();
  let recognizer: Promise<SherpaRecognizer> | undefined;
  const load = (): Promise<SherpaRecognizer> => {
    const folder = ready("parakeet", dir);
    recognizer ??= loadSherpa()
      .OfflineRecognizer.createAsync({
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: {
          transducer: {
            encoder: join(folder, "encoder.int8.onnx"),
            decoder: join(folder, "decoder.int8.onnx"),
            joiner: join(folder, "joiner.int8.onnx"),
          },
          tokens: join(folder, "tokens.txt"),
          modelType: "nemo_transducer",
          numThreads: options.threads ?? 4,
          provider: "cpu",
        },
      })
      .catch((error: unknown) => {
        recognizer = undefined;
        throw error;
      });
    return recognizer;
  };
  return {
    name: "local",
    warm: async () => {
      await load();
    },
    async transcribe(ogg: Buffer): Promise<string> {
      const engine = await load();
      const stream = engine.createStream();
      stream.acceptWaveform({
        samples: toFloat(oggOpusToPcm(ogg, 16000)),
        sampleRate: 16000,
      });
      const result = await engine.decodeAsync(stream);
      return (result.text ?? "").replace(/\s+/g, " ").trim();
    },
  };
}

function createSupertonicSpeaker(options: SupertonicOptions = {}) {
  const dir = options.modelsDir ?? defaultModelsDir();
  let tts: Promise<SherpaTts> | undefined;
  const load = (): Promise<SherpaTts> => {
    const folder = ready("supertonic", dir);
    const file = (name: string) => join(folder, name);
    tts ??= loadSherpa()
      .OfflineTts.createAsync({
        model: {
          supertonic: {
            durationPredictor: file("duration_predictor.int8.onnx"),
            textEncoder: file("text_encoder.int8.onnx"),
            vectorEstimator: file("vector_estimator.int8.onnx"),
            vocoder: file("vocoder.int8.onnx"),
            ttsJson: file("tts.json"),
            unicodeIndexer: file("unicode_indexer.bin"),
            voiceStyle: file("voice.bin"),
          },
          numThreads: options.threads ?? 4,
          provider: "cpu",
        },
        maxNumSentences: 1,
      })
      .catch((error: unknown) => {
        tts = undefined;
        throw error;
      });
    return tts;
  };
  return {
    name: "local",
    onDevice: true,
    warm: async () => {
      await load();
    },
    async synthesize(
      text: string,
      signal: AbortSignal,
      language = "en"
    ): Promise<Buffer> {
      const engine = await load();
      const sherpaModule = loadSherpa();
      const audio = await engine.generateAsync({
        text,
        generationConfig: new sherpaModule.GenerationConfig({
          sid: options.speaker ?? DEFAULT_SPEAKER,
          numSteps: 8,
          extra: { lang: SUPERTONIC_LANGUAGES.has(language) ? language : "en" },
        }),
        // Returning 0 stops the generation: a cancelled turn doesn't keep the CPU busy.
        onProgress: () => (signal.aborted ? 0 : 1),
      });
      signal.throwIfAborted();
      const samples =
        audio.sampleRate === OUTPUT_RATE
          ? audio.samples
          : new sherpaModule.LinearResampler(
              audio.sampleRate,
              OUTPUT_RATE
            ).flush(audio.samples);
      return pcmToOggOpus(toPcm(samples), OUTPUT_RATE);
    },
  };
}

export { createParakeetListener, createSupertonicSpeaker };
