import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import OpusScript from "opusscript";
import { describe, expect, it } from "vitest";

import { opusPacketSamples48k, readOggOpus, writeOggOpus } from "./ogg-opus";

const hasFfmpeg = (() => {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function tone(samples: number, rate: number): Buffer {
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    pcm.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000),
      i * 2
    );
  }
  return pcm;
}

// What a charm sends: 60 ms Opus packets encoded from 16 kHz mono.
function charmPackets(count: number): Buffer[] {
  const encoder = new OpusScript(16000, 1, OpusScript.Application.VOIP);
  const packets: Buffer[] = [];
  for (let i = 0; i < count; i++)
    packets.push(Buffer.from(encoder.encode(tone(960, 16000), 960)));
  encoder.delete();
  return packets;
}

describe("opusPacketSamples48k", () => {
  it("reads a 60 ms packet as 2880 samples at 48 kHz", () => {
    const [packet] = charmPackets(1);
    expect(opusPacketSamples48k(packet!)).toBe(2880);
  });

  it("reads a 20 ms packet as 960 samples", () => {
    const encoder = new OpusScript(24000, 1, OpusScript.Application.AUDIO);
    const packet = Buffer.from(encoder.encode(tone(480, 24000), 480));
    encoder.delete();
    expect(opusPacketSamples48k(packet)).toBe(960);
  });
});

describe("writeOggOpus / readOggOpus", () => {
  it("round-trips packets and the header", () => {
    const packets = charmPackets(25);
    const { head, packets: back } = readOggOpus(
      writeOggOpus(packets, { inputSampleRate: 16000 })
    );
    expect(head).toMatchObject({ channels: 1, inputSampleRate: 16000 });
    expect(back).toEqual(packets);
  });

  it("round-trips packets larger than 255 bytes and pages that fill up", () => {
    const packets = Array.from({ length: 300 }, (_, i) =>
      Buffer.alloc(300 + (i % 7), i % 251)
    );
    for (const packet of packets) packet[0] = 0xf8; // a valid TOC byte (config 31, one frame)
    const back = readOggOpus(
      writeOggOpus(packets, { inputSampleRate: 16000 })
    ).packets;
    expect(back).toEqual(packets);
  });

  it("rejects data that isn't Ogg Opus", () => {
    expect(() => readOggOpus(Buffer.from("RIFF....WAVEfmt "))).toThrow(/Ogg/);
  });
});

describe.skipIf(!hasFfmpeg)(
  "interop with ffmpeg (what speech APIs read and write)",
  () => {
    it("ffprobe accepts our Ogg and measures the right duration", () => {
      const dir = mkdtempSync(join(tmpdir(), "oc-ogg-"));
      const file = join(dir, "charm.ogg");
      writeFileSync(
        file,
        writeOggOpus(charmPackets(50), { inputSampleRate: 16000 })
      );
      const seconds = Number(
        execFileSync("ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "csv=p=0",
          file,
        ]).toString()
      );
      expect(seconds).toBeCloseTo(3, 1);
    });

    it("reads ffmpeg's Ogg Opus and decodes every packet at 24 kHz", () => {
      const dir = mkdtempSync(join(tmpdir(), "oc-ogg-"));
      const file = join(dir, "tts.ogg");
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=330:duration=2",
        "-c:a",
        "libopus",
        "-ar",
        "24000",
        "-ac",
        "1",
        file,
      ]);
      const { packets } = readOggOpus(readFileSync(file));
      const decoder = new OpusScript(24000, 1);
      const samples = packets.reduce(
        (sum, p) => sum + decoder.decode(p).length / 2,
        0
      );
      decoder.delete();
      expect(samples / 24000).toBeCloseTo(2, 1);
    });
  }
);
