import { type IncomingMessage, createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { readOggOpus } from "../audio/ogg-opus";
import { pcmToOggOpus } from "../audio/opus-codec";
import {
  createElevenLabsListener,
  createElevenLabsSpeaker,
} from "./elevenlabs";

type Seen = { method: string; url: string; key: string; body: Buffer };
type Reply = (seen: Seen) => {
  status?: number;
  chunks?: Buffer[];
  json?: unknown;
};

const closers: (() => void)[] = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

function body(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const parts: Buffer[] = [];
    request.on("data", (part: Buffer) => parts.push(part));
    request.on("end", () => resolve(Buffer.concat(parts)));
  });
}

// A stand-in for api.elevenlabs.io that records what it was sent.
async function server(reply: Reply): Promise<{ url: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  const http = createServer((request, response) => {
    void body(request).then((data) => {
      const entry = {
        method: request.method ?? "",
        url: request.url ?? "",
        key: String(request.headers["xi-api-key"] ?? ""),
        body: data,
      };
      seen.push(entry);
      const { status = 200, chunks, json } = reply(entry);
      response.statusCode = status;
      if (json !== undefined) {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(json));
        return;
      }
      for (const chunk of chunks ?? []) response.write(chunk);
      response.end();
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  closers.push(() => http.close());
  return {
    url: `http://127.0.0.1:${(http.address() as AddressInfo).port}`,
    seen,
  };
}

async function collect(stream: AsyncIterable<Buffer>): Promise<Buffer[]> {
  const packets: Buffer[] = [];
  for await (const packet of stream) packets.push(packet);
  return packets;
}

// 250 ms of a 24 kHz tone, 16-bit mono.
function tone(): Buffer {
  const pcm = Buffer.alloc(6000 * 2);
  for (let i = 0; i < 6000; i++)
    pcm.writeInt16LE(Math.round(8000 * Math.sin(i / 10)), i * 2);
  return pcm;
}

const signal = new AbortController().signal;

describe("ElevenLabs listening", () => {
  it("sends the charm's Ogg to Scribe with the key, the model and no sound tags", async () => {
    const api = await server(() => ({ json: { text: " Ciao, come stai? " } }));
    const listener = createElevenLabsListener({
      apiKey: "k-1",
      baseUrl: api.url,
    });
    const ogg = pcmToOggOpus(Buffer.alloc(3200), 16000);
    expect(await listener.transcribe(ogg, signal)).toBe("Ciao, come stai?");
    const [request] = api.seen;
    expect(request).toMatchObject({
      method: "POST",
      url: "/v1/speech-to-text",
      key: "k-1",
    });
    const form = request?.body.toString("latin1") ?? "";
    expect(form).toMatch(/name="model_id"\r\n\r\nscribe_v2\r\n/);
    expect(form).toMatch(/name="tag_audio_events"\r\n\r\nfalse\r\n/);
    expect(request?.body.includes(ogg)).toBe(true);
  });

  it("names the status on an error, never the key", async () => {
    const api = await server(() => ({ status: 401, json: { detail: "no" } }));
    const listener = createElevenLabsListener({
      apiKey: "secret-key",
      baseUrl: api.url,
    });
    const error = await listener
      .transcribe(Buffer.alloc(0), signal)
      .catch((e: Error) => e);
    expect(String(error)).toMatch(/speech-to-text failed: 401/);
    expect(String(error)).not.toMatch(/secret-key/);
  });

  it("refuses to start without a key", () => {
    expect(() => createElevenLabsListener({})).toThrow(/API key/);
  });
});

describe("ElevenLabs speaking", () => {
  it("streams PCM into Opus packets, even when a sample is split across chunks", async () => {
    const pcm = tone();
    const api = await server(() => ({
      chunks: [
        pcm.subarray(0, 1001),
        pcm.subarray(1001, 7777),
        pcm.subarray(7777),
      ],
    }));
    const speaker = createElevenLabsSpeaker({
      apiKey: "k",
      baseUrl: api.url,
      voice: "v 1",
    });
    const packets = await collect(
      speaker.stream!("Hello there.", signal, "en")
    );
    // 250 ms in 60 ms frames: four whole ones and the rest padded.
    expect(packets).toHaveLength(5);
    const [request] = api.seen;
    expect(request?.url).toBe(
      "/v1/text-to-speech/v%201/stream?output_format=pcm_24000"
    );
    expect(JSON.parse(request?.body.toString() ?? "")).toEqual({
      text: "Hello there.",
      model_id: "eleven_v4_turbo",
      language_code: "en",
    });
    const ogg = await speaker.synthesize("Hello there.", signal, "en");
    expect(readOggOpus(ogg).packets).toHaveLength(5);
  });

  it("sends no language to Multilingual v2, which takes none", async () => {
    const api = await server(() => ({ chunks: [tone()] }));
    const speaker = createElevenLabsSpeaker({
      apiKey: "k",
      baseUrl: api.url,
      voice: "v",
      model: "eleven_multilingual_v2",
    });
    await collect(speaker.stream!("Ciao.", signal, "it"));
    expect(JSON.parse(api.seen[0]?.body.toString() ?? "")).toEqual({
      text: "Ciao.",
      model_id: "eleven_multilingual_v2",
    });
  });

  it("uses the account's first voice when none is set, and asks for it once", async () => {
    const api = await server(({ url }) =>
      url === "/v1/voices"
        ? { json: { voices: [{ voice_id: "first" }, { voice_id: "second" }] } }
        : { chunks: [tone()] }
    );
    const speaker = createElevenLabsSpeaker({ apiKey: "k", baseUrl: api.url });
    await speaker.warm?.();
    await collect(speaker.stream!("One.", signal));
    await collect(speaker.stream!("Two.", signal));
    expect(api.seen.map((s) => s.url.split("?")[0])).toEqual([
      "/v1/voices",
      "/v1/text-to-speech/first/stream",
      "/v1/text-to-speech/first/stream",
    ]);
  });

  it("asks for the voices again after a failure", async () => {
    let calls = 0;
    const api = await server(({ url }) => {
      if (url !== "/v1/voices") return { chunks: [tone()] };
      calls += 1;
      return calls === 1
        ? { status: 503 }
        : { json: { voices: [{ voice_id: "v" }] } };
    });
    const speaker = createElevenLabsSpeaker({ apiKey: "k", baseUrl: api.url });
    await expect(collect(speaker.stream!("One.", signal))).rejects.toThrow(
      /voices failed: 503/
    );
    expect(await collect(speaker.stream!("Two.", signal))).toHaveLength(5);
  });

  it("names the status on an error, never the key", async () => {
    const api = await server(() => ({ status: 429 }));
    const speaker = createElevenLabsSpeaker({
      apiKey: "secret-key",
      baseUrl: api.url,
      voice: "v",
    });
    const error = await collect(speaker.stream!("Hi.", signal)).catch(
      (e: Error) => e
    );
    expect(String(error)).toMatch(/text-to-speech failed: 429/);
    expect(String(error)).not.toMatch(/secret-key/);
  });
});

describe("ElevenLabs voices", () => {
  it("lists the account's voices by name, with what ElevenLabs says about them", async () => {
    const api = await server(() => ({
      json: {
        voices: [
          {
            voice_id: "a1",
            name: "Ada",
            preview_url: "https://example.com/ada.mp3",
            labels: { accent: "british", gender: "female", age: "" },
          },
          { voice_id: "b2", name: "", preview_url: "http://example.com/b.mp3" },
          { name: "no id" },
        ],
      },
    }));
    const speaker = createElevenLabsSpeaker({ apiKey: "k", baseUrl: api.url });
    expect(await speaker.voices?.()).toEqual([
      {
        id: "a1",
        name: "Ada",
        preview: "https://example.com/ada.mp3",
        description: "british · female",
      },
      // No name: its ID; a preview not over https is dropped.
      { id: "b2", name: "b2" },
    ]);
    expect(api.seen[0]).toMatchObject({ url: "/v1/voices", key: "k" });
  });

  it("names the status when the list fails, never the key", async () => {
    const api = await server(() => ({ status: 401 }));
    const speaker = createElevenLabsSpeaker({
      apiKey: "secret-key",
      baseUrl: api.url,
    });
    const message = await speaker.voices?.().then(
      () => "",
      (e: unknown) => (e instanceof Error ? e.message : "")
    );
    expect(message).toMatch(/voices failed: 401/);
    expect(message).not.toMatch(/secret-key/);
  });
});
