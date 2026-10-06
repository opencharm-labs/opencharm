// A click track at the film's tempo, to cut against until the licensed music is in public/.
// Kick on every beat, a higher tick on the off-beat, an accent on each bar.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { BEATS, TRACK } from "../src/track";

const RATE = 44100;
const seconds = TRACK.firstBeat + (BEATS * 60) / TRACK.bpm + 1;
const samples = new Int16Array(Math.ceil(seconds * RATE));

function hit(at: number, freq: number, decay: number, gain: number) {
  const start = Math.round(at * RATE);
  for (let i = 0; i < RATE * 0.4 && start + i < samples.length; i++) {
    const t = i / RATE;
    const pitch = freq * (1 + 2 * Math.exp(-t * 40));
    const v = Math.sin(2 * Math.PI * pitch * t) * Math.exp(-t * decay) * gain;
    samples[start + i] = Math.max(
      -32767,
      Math.min(32767, samples[start + i]! + v * 32767)
    );
  }
}

for (let b = 0; b < BEATS; b++) {
  const at = TRACK.firstBeat + (b * 60) / TRACK.bpm;
  hit(at, 55, 9, b % 4 === 0 ? 0.9 : 0.6);
  hit(at + 30 / TRACK.bpm, 2400, 60, 0.12);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + samples.byteLength, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(samples.byteLength, 40);
const file = join(import.meta.dirname, "../public", TRACK.file);
writeFileSync(file, Buffer.concat([header, Buffer.from(samples.buffer)]));
console.log(`wrote ${file}`);
