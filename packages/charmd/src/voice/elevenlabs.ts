// ElevenLabs for listening (Scribe) and speaking (spec 003), with the person's key. Its API isn't
// OpenAI's, so it has its own client. Speech streams as 24 kHz PCM, encoded to Opus as it arrives,
// so a sentence starts playing before ElevenLabs has finished it. Errors name the status, never the key.
import { writeOggOpus } from "../audio/ogg-opus";
import { createOpusEncoder } from "../audio/opus-codec";
import type { Listener, Speaker } from "./types";

type ElevenLabsOptions = {
  apiKey?: string;
  // Tests point at a local server.
  baseUrl?: string;
  model?: string;
  voice?: string;
};

const BASE_URL = "https://api.elevenlabs.io";
const LISTEN_MODEL = "scribe_v2";
// Low latency and 90+ languages (ElevenLabs' model page, 13 October 2026).
const SPEAK_MODEL = "eleven_v4_turbo";
const SAMPLE_RATE = 24000;
// The voice list is shared by every sentence waiting on it, so it has its own deadline, not theirs.
const VOICES_TIMEOUT_MS = 5000;

function settings(options: ElevenLabsOptions): {
  apiKey: string;
  baseUrl: string;
} {
  if (!options.apiKey)
    throw new Error(
      "The elevenlabs voice needs an API key: set apiKey or ELEVENLABS_API_KEY"
    );
  return {
    apiKey: options.apiKey,
    baseUrl: (options.baseUrl ?? BASE_URL).replace(/\/$/, ""),
  };
}

async function failed(what: string, response: Response): Promise<never> {
  await response.body?.cancel().catch(() => undefined);
  throw new Error(
    `ElevenLabs ${what} failed: ${response.status} ${response.statusText}`
  );
}

function createElevenLabsListener(options: ElevenLabsOptions): Listener {
  const { apiKey, baseUrl } = settings(options);
  return {
    name: "elevenlabs",
    async transcribe(ogg, signal) {
      const form = new FormData();
      form.append("model_id", options.model ?? LISTEN_MODEL);
      // Words only: "(laughs)" would reach the agent as something said.
      form.append("tag_audio_events", "false");
      form.append(
        "file",
        new Blob([new Uint8Array(ogg)], { type: "audio/ogg" }),
        "speech.ogg"
      );
      const response = await fetch(`${baseUrl}/v1/speech-to-text`, {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
        signal,
      });
      if (!response.ok) return failed("speech-to-text", response);
      const { text } = (await response.json()) as { text?: unknown };
      return typeof text === "string" ? text.trim() : "";
    },
  };
}

function createElevenLabsSpeaker(options: ElevenLabsOptions): Speaker {
  const { apiKey, baseUrl } = settings(options);
  const model = options.model ?? SPEAK_MODEL;
  // No voice chosen: the first in the person's account, asked once (again after a failure).
  let voice: Promise<string> | undefined = options.voice
    ? Promise.resolve(options.voice)
    : undefined;
  function voiceId(): Promise<string> {
    voice ??= (async () => {
      const response = await fetch(`${baseUrl}/v1/voices`, {
        headers: { "xi-api-key": apiKey },
        signal: AbortSignal.timeout(VOICES_TIMEOUT_MS),
      });
      if (!response.ok) return failed("voices", response);
      const { voices } = (await response.json()) as {
        voices?: { voice_id?: unknown }[];
      };
      const id = voices?.find((v) => typeof v.voice_id === "string")?.voice_id;
      if (typeof id !== "string")
        throw new Error("ElevenLabs: this account has no voices");
      return id;
    })().catch((error: unknown) => {
      voice = undefined;
      throw error;
    });
    return voice;
  }

  async function* stream(
    text: string,
    signal: AbortSignal,
    language?: string
  ): AsyncIterable<Buffer> {
    const id = await voiceId();
    const response = await fetch(
      `${baseUrl}/v1/text-to-speech/${encodeURIComponent(id)}/stream?output_format=pcm_${SAMPLE_RATE}`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: model,
          // Multilingual v2 takes no language; the others follow the sentence's.
          ...(language && !model.includes("multilingual_v2")
            ? { language_code: language }
            : {}),
        }),
        signal,
      }
    );
    if (!response.ok) await failed("text-to-speech", response);
    const body = response.body;
    if (!body) throw new Error("ElevenLabs text-to-speech sent no audio");
    const encoder = createOpusEncoder(SAMPLE_RATE);
    let ended = false;
    try {
      for await (const chunk of body as AsyncIterable<Uint8Array>)
        yield* encoder.push(Buffer.from(chunk));
      ended = true;
      yield* encoder.end();
    } finally {
      if (!ended) encoder.end();
    }
  }

  return {
    name: "elevenlabs",
    stream,
    async synthesize(text, signal, language) {
      const packets: Buffer[] = [];
      for await (const packet of stream(text, signal, language))
        packets.push(packet);
      return writeOggOpus(packets, { inputSampleRate: SAMPLE_RATE });
    },
    async warm() {
      await voiceId().catch(() => undefined);
    },
  };
}

export { createElevenLabsListener, createElevenLabsSpeaker };
export type { ElevenLabsOptions };
