// ElevenLabs for listening (Scribe) and speaking (spec 003), with the person's key. Its API isn't
// OpenAI's, so it has its own client. Speech streams as 24 kHz PCM, encoded to Opus as it arrives,
// so a sentence starts playing before ElevenLabs has finished it. Errors name the status, never the key.
import WebSocket from "ws";
import { z } from "zod";

import { writeOggOpus } from "../audio/ogg-opus";
import { createOpusDecoder, createOpusEncoder } from "../audio/opus-codec";
import type {
  Listener,
  LiveTranscription,
  Speaker,
  VoiceChoice,
} from "./types";

type ElevenLabsOptions = {
  apiKey?: string;
  // Tests point at a local server.
  baseUrl?: string;
  model?: string;
  voice?: string;
  // How long the live transcript may take once the key is let go; tests shorten it.
  liveFinishMs?: number;
};

const BASE_URL = "https://api.elevenlabs.io";
const LISTEN_MODEL = "scribe_v2";
const LIVE_MODEL = "scribe_v2_realtime";
// Past this the clip goes to Scribe whole instead: a slow live answer never holds up a turn.
const LIVE_FINISH_MS = 3000;
const LIVE_RATE = 16000;
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

function describe(labels: unknown): string | undefined {
  if (typeof labels !== "object" || labels === null) return undefined;
  const words = Object.values(labels).filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  return words.length > 0 ? words.join(" · ") : undefined;
}

// The voices in the person's account, in ElevenLabs' order. A preview is kept only over https: the
// settings window plays it.
// One entry of ElevenLabs' list; IDs are letters and digits, as the desktop app accepts them.
const voiceEntry = z.object({
  voice_id: z.string().regex(/^[A-Za-z0-9]{1,64}$/),
  name: z.string().optional(),
  preview_url: z.string().optional(),
  labels: z.record(z.string(), z.unknown()).nullish(),
});

async function listVoices(
  baseUrl: string,
  apiKey: string
): Promise<VoiceChoice[]> {
  const response = await fetch(`${baseUrl}/v1/voices`, {
    headers: { "xi-api-key": apiKey },
    signal: AbortSignal.timeout(VOICES_TIMEOUT_MS),
  });
  if (!response.ok) return failed("voices", response);
  const { voices } = (await response.json()) as { voices?: unknown };
  if (!Array.isArray(voices)) return [];
  // An entry that isn't a voice is skipped, never the whole list.
  return voices.flatMap((entry: unknown) => {
    const parsed = voiceEntry.safeParse(entry);
    if (!parsed.success) return [];
    const v = parsed.data;
    const preview = v.preview_url?.startsWith("https://")
      ? v.preview_url
      : undefined;
    const description = describe(v.labels);
    return [
      {
        id: v.voice_id,
        name: v.name || v.voice_id,
        ...(preview ? { preview } : {}),
        ...(description ? { description } : {}),
      },
    ];
  });
}

// Scribe's realtime model over a WebSocket, opened when the hold is confirmed: the charm's packets are
// decoded to 16 kHz PCM and sent as they come; letting go sends the last of it with a commit, and the
// committed transcript is the answer. One packet is held back so the commit carries audio.
function liveTranscription(
  baseUrl: string,
  apiKey: string,
  finishMs: number
): LiveTranscription {
  const url = `${baseUrl.replace(/^http/, "ws")}/v1/speech-to-text/realtime?model_id=${LIVE_MODEL}&audio_format=pcm_${LIVE_RATE}&commit_strategy=manual`;
  const socket = new WebSocket(url, {
    headers: { "xi-api-key": apiKey },
    handshakeTimeout: finishMs,
  });
  const decoder = createOpusDecoder(LIVE_RATE);
  const waiting: string[] = [];
  const texts: string[] = [];
  let held: Buffer | undefined;
  let failure: Error | undefined;
  let settle: (() => void) | undefined;
  let over = false;
  const fail = (why: string) => {
    failure ??= new Error(`ElevenLabs live speech-to-text: ${why}`);
    settle?.();
  };
  const send = (pcm: Buffer, commit: boolean) => {
    const message = JSON.stringify({
      message_type: "input_audio_chunk",
      audio_base_64: pcm.toString("base64"),
      commit,
      sample_rate: LIVE_RATE,
    });
    if (socket.readyState === WebSocket.OPEN) socket.send(message);
    else if (socket.readyState === WebSocket.CONNECTING) waiting.push(message);
  };
  const close = () => {
    if (over) return;
    over = true;
    decoder.free();
    socket.terminate();
  };
  socket.on("open", () => {
    for (const message of waiting.splice(0)) socket.send(message);
  });
  socket.on("message", (data: WebSocket.RawData) => {
    let message: { message_type?: unknown; text?: unknown; error?: unknown };
    try {
      message = JSON.parse(String(data)) as typeof message;
    } catch {
      return;
    }
    if (
      message.message_type === "committed_transcript" &&
      typeof message.text === "string"
    ) {
      texts.push(message.text);
      settle?.();
    } else if (message.error !== undefined)
      fail(String(message.message_type ?? "error"));
  });
  socket.on("error", (error: Error) => fail(error.message));
  socket.on("close", () => fail("closed"));
  return {
    push(frame) {
      if (over) return;
      const pcm = decoder.decode(frame);
      if (pcm.length === 0) return;
      if (held) send(held, false);
      held = pcm;
    },
    finish(signal) {
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => fail("no transcript in time"), finishMs);
        const onAbort = () => fail("cancelled");
        const end = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          settle = undefined;
          close();
          if (signal.aborted) reject(signal.reason);
          else if (texts.length > 0) resolve(texts.join(" ").trim());
          else
            reject(
              failure ?? new Error("ElevenLabs live speech-to-text: nothing")
            );
        };
        settle = end;
        if (failure || over) return end();
        signal.addEventListener("abort", onAbort, { once: true });
        send(held ?? Buffer.alloc(0), true);
        held = undefined;
      });
    },
    cancel: close,
  };
}

function createElevenLabsListener(options: ElevenLabsOptions): Listener {
  const { apiKey, baseUrl } = settings(options);
  return {
    name: "elevenlabs",
    live: () =>
      liveTranscription(
        baseUrl,
        apiKey,
        options.liveFinishMs ?? LIVE_FINISH_MS
      ),
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
      const [first] = await listVoices(baseUrl, apiKey);
      if (!first) throw new Error("ElevenLabs: this account has no voices");
      return first.id;
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
    voices: () => listVoices(baseUrl, apiKey),
  };
}

export { createElevenLabsListener, createElevenLabsSpeaker };
export type { ElevenLabsOptions };
