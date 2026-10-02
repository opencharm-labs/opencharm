import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";

import OpusScript from "opusscript";
import { afterEach, describe, expect, it } from "vitest";

import { readOggOpus, writeOggOpus } from "../audio/ogg-opus";
import { createFakeVoice } from "./fake";
import { createLocalVoice, defaultWhisperModel } from "./local";
import { createOpenAiVoice } from "./openai";
import { readWav, writeWav } from "./wav";

const signal = new AbortController().signal;
let server: Server | undefined;

function oggSeconds(ogg: Buffer): number {
  const decoder = new OpusScript(24000, 1);
  const samples = readOggOpus(ogg).packets.reduce(
    (sum, p) => sum + decoder.decode(p).length / 2,
    0
  );
  decoder.delete();
  return samples / 24000;
}

function has(command: string): boolean {
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

afterEach(() => {
  server?.close();
  server = undefined;
});

describe("wav", () => {
  it("round-trips 16-bit mono PCM", () => {
    const pcm = Buffer.from([1, 0, 255, 127, 0, 128]);
    expect(readWav(writeWav(pcm, 16000))).toEqual({
      sampleRate: 16000,
      channels: 1,
      pcm,
    });
  });

  it("rejects files that are not PCM WAV", () => {
    expect(() => readWav(Buffer.from("OggS...."))).toThrow(/WAV/);
  });
});

describe("openai voice", () => {
  it("sends Ogg to transcriptions and asks speech for Opus", async () => {
    const seen: Array<{ url: string; type: string; body: Buffer }> = [];
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        seen.push({
          url: req.url ?? "",
          type: req.headers["content-type"] ?? "",
          body: Buffer.concat(chunks),
        });
        if (req.url?.endsWith("/audio/transcriptions")) {
          res
            .writeHead(200, { "content-type": "application/json" })
            .end(JSON.stringify({ text: "What's on today?" }));
        } else {
          res
            .writeHead(200, { "content-type": "audio/ogg" })
            .end(Buffer.from("OGGDATA"));
        }
      });
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const voice = createOpenAiVoice({
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
      apiKey: "k",
    });
    expect(await voice.transcribe(Buffer.from("OggS-audio"), signal)).toBe(
      "What's on today?"
    );
    expect(await voice.synthesize("Hello.", signal)).toEqual(
      Buffer.from("OGGDATA")
    );
    expect(seen[0]!.type).toMatch(/multipart\/form-data/);
    expect(seen[0]!.body.toString()).toContain("gpt-4o-mini-transcribe");
    expect(seen[0]!.body.toString()).toContain("OggS-audio");
    expect(JSON.parse(seen[1]!.body.toString())).toMatchObject({
      model: "gpt-4o-mini-tts",
      input: "Hello.",
      response_format: "opus",
    });
  });

  it("explains a missing key", () => {
    expect(() => createOpenAiVoice({})).toThrow(/OPENAI_API_KEY/);
  });
});

describe("fake voice", () => {
  it("transcribes to its configured text", async () => {
    expect(
      await createFakeVoice({ transcript: "the weather" }).transcribe(
        Buffer.alloc(0),
        signal
      )
    ).toBe("the weather");
  });

  it("synthesizes real Ogg Opus, longer for longer text", async () => {
    const voice = createFakeVoice();
    const short = oggSeconds(await voice.synthesize("Hi there.", signal));
    const long = oggSeconds(
      await voice.synthesize(
        "This is a much longer sentence to say out loud.",
        signal
      )
    );
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
  });
});

describe.skipIf(!has("say"))("local voice: speech", () => {
  it("speaks text into Ogg Opus that decodes at 24 kHz", async () => {
    const seconds = oggSeconds(
      await createLocalVoice({}).synthesize("Hello from your charm.", signal)
    );
    expect(seconds).toBeGreaterThan(0.5);
    expect(seconds).toBeLessThan(5);
  });
});

describe.skipIf(
  !has("say") || !has("whisper-cli") || !existsSync(defaultWhisperModel())
)("local voice: round trip", () => {
  it("hears what it said", async () => {
    const voice = createLocalVoice({});
    const ogg = await voice.synthesize(
      "Remember that my bike is in the garage.",
      signal
    );
    // Re-encode as the charm would: 16 kHz, 60 ms packets.
    const decoder = new OpusScript(16000, 1);
    const encoder = new OpusScript(16000, 1, OpusScript.Application.VOIP);
    const pcm = Buffer.concat(
      readOggOpus(ogg).packets.map((p) => Buffer.from(decoder.decode(p)))
    );
    const packets: Buffer[] = [];
    for (let i = 0; i + 1920 <= pcm.length; i += 1920)
      packets.push(Buffer.from(encoder.encode(pcm.subarray(i, i + 1920), 960)));
    decoder.delete();
    encoder.delete();
    const text = await voice.transcribe(
      writeOggOpus(packets, { inputSampleRate: 16000 }),
      signal
    );
    expect(text.toLowerCase()).toContain("garage");
  }, 60_000);
});
