// Plays one full turn against a running charmd, the way a charm would: spoken question in (macOS `say`,
// 16 kHz Opus in 60 ms packets), spoken answer out (saved as a WAV). No hardware, no emulator needed.
// Usage: tsx scripts/smoke-turn.ts <ws-url> <token> <pin> "<question>" <out.wav>
// Questions from the agent (permission requests) get SMOKE_ANSWER: "yes" or "no" (default).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import OpusScript from "opusscript";
import WebSocket from "ws";

import { toBuffer } from "../src/device/raw-data";
import { readWav, writeWav } from "../src/voice/wav";

const [url, token, pin, question, out] = process.argv.slice(2);
if (!url || !token || !pin || !question || !out) {
  console.error(
    'Usage: tsx scripts/smoke-turn.ts <ws-url> <token> <pin> "<question>" <out.wav>'
  );
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "oc-smoke-"));
const questionWav = join(dir, "q.wav");
execFileSync("say", [
  "-o",
  questionWav,
  "--file-format=WAVE",
  "--data-format=LEI16@16000",
  question,
]);
const { pcm } = readWav(readFileSync(questionWav));
const encoder = new OpusScript(16000, 1, OpusScript.Application.VOIP);
const packets: Buffer[] = [];
for (let i = 0; i + 1920 <= pcm.length; i += 1920)
  packets.push(Buffer.from(encoder.encode(pcm.subarray(i, i + 1920), 960)));
encoder.delete();

const decoder = new OpusScript(24000, 1);
const answer: Buffer[] = [];
const ws = new WebSocket(url, {
  headers: { Authorization: `Bearer ${token}` },
});
let released = 0;
let firstAudio = 0;

ws.on("open", () =>
  ws.send(
    JSON.stringify({
      type: "hello",
      version: 1,
      features: { opencharm: true },
      transport: "websocket",
      audio_params: {
        format: "opus",
        sample_rate: 16000,
        channels: 1,
        frame_duration: 60,
      },
    })
  )
);
ws.on("message", (data, isBinary) => {
  const buffer = toBuffer(data);
  if (isBinary) {
    if (!firstAudio) firstAudio = Date.now();
    answer.push(Buffer.from(decoder.decode(buffer)));
    return;
  }
  const message = JSON.parse(buffer.toString("utf8")) as {
    type: string;
    op?: string;
    state?: string;
    text?: string;
    reason?: string;
    id?: string;
  };
  console.log("←", JSON.stringify(message));
  if (message.op === "ask")
    ws.send(
      JSON.stringify({
        type: "charm",
        op: "answer",
        id: message.id,
        yes: process.env.SMOKE_ANSWER === "yes",
      })
    );
  if (message.op === "locked" && message.reason === "boot")
    ws.send(JSON.stringify({ type: "charm", op: "unlock", pin }));
  if (message.op === "unlocked") {
    ws.send(JSON.stringify({ type: "listen", state: "start", mode: "manual" }));
    for (const packet of packets) ws.send(packet);
    ws.send(JSON.stringify({ type: "listen", state: "stop" }));
    released = Date.now();
  }
  if (
    message.op === "face" &&
    (message.state === "idle" || message.state === "failed") &&
    released
  ) {
    writeFileSync(out, writeWav(Buffer.concat(answer), 24000));
    console.log(
      `key released → first audio: ${firstAudio ? firstAudio - released : "none"} ms; answer ${(Buffer.concat(answer).length / 48000).toFixed(1)} s → ${out}`
    );
    decoder.delete();
    ws.close();
  }
});
ws.on("close", () => process.exit(0));
setTimeout(() => {
  console.error("No answer within 90 s");
  process.exit(1);
}, 90_000);
