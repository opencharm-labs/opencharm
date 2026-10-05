// Shared by the end-to-end tests: a real charmd, the emulator served by `opencharm sim`, headless
// Chrome with a fake microphone (never the real one), and a fake ACP agent process.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseConfig } from "@opencharm-labs/charmd/config";
import { type Daemon, startDaemon } from "@opencharm-labs/charmd/daemon";
import { type Browser, type Page, chromium } from "playwright";

import { createSimServer } from "../src/commands/sim";

type Trace = {
  connected: boolean;
  micReady: boolean; // the microphone is open right now
  micOpens: number;
  panelOpen?: boolean; // the desktop charm's panel under the notch
  micFrames: number;
  audioFrames: number;
  messages: Array<{
    type: string;
    op?: string;
    state?: string;
    text?: string;
    code?: string;
    id?: string;
  }>;
};
type Emulator = {
  daemon: Daemon;
  page: Page;
  close: () => Promise<void>;
};

const HERE = dirname(fileURLToPath(import.meta.url));
const SIM = join(HERE, "..", "sim");
const SHOTS = join(HERE, "..", "..", "..", "firmware", "sim", "build", "e2e");
const SIZE = 480;
// A real ACP agent process (official SDK): "You said: <text>.", or a permission request when the
// text has "permission" in it ("Done." on yes, "Not allowed." on no).
const FAKE_ACP_AGENT = join(
  HERE,
  "..",
  "..",
  "charmd",
  "src",
  "agent",
  "fixtures",
  "fake-acp-agent.mjs"
);

// Two seconds of a 330 Hz tone: the fake voice "hears" a fixed sentence whatever arrives.
function toneWav(path: string): void {
  const rate = 16000;
  const samples = rate * 2;
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++)
    pcm.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 330 * i) / rate) * 6000),
      i * 2
    );
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(path, Buffer.concat([header, pcm]));
}

async function startEmulator(
  transcript: string,
  query = "",
  // Present as the desktop app does (its hello says kind "desktop"), for what only it offers.
  options: { desktop?: boolean } = {}
): Promise<Emulator> {
  const dir = mkdtempSync(join(tmpdir(), "oc-e2e-"));
  const wav = join(dir, "mic.wav");
  toneWav(wav);
  const daemon = await startDaemon(
    parseConfig({
      listen: { port: 0 },
      statePath: join(dir, "state.json"),
      voice: { provider: "fake", transcript },
      agent: { adapter: "acp", command: [process.execPath, FAKE_ACP_AGENT] },
    }),
    { quiet: true }
  );
  const server: Server = createSimServer(SIM, daemon.url);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const browser: Browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${wav}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1100, height: 800 },
  });
  page.on("pageerror", (error) => console.error("page error:", error.message));
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error")
      console.error("page:", message.text());
  });
  if (options.desktop)
    await page.addInitScript("window.charmParams = location.search.slice(1);");
  await page.goto(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/${query}`
  );
  mkdirSync(SHOTS, { recursive: true });
  return {
    daemon,
    page,
    close: async () => {
      await browser.close();
      server.close();
      await daemon.close();
    },
  };
}

// Undefined until sim.js has run: it awaits config.json and the WebAssembly loader first, and the
// page's load event doesn't wait for a module's top-level await.
function trace(page: Page): Promise<Trace | undefined> {
  return page.evaluate(
    () => (globalThis as unknown as { __charm?: Trace }).__charm
  );
}

async function waitFor(
  page: Page,
  check: (t: Trace) => boolean,
  what: string,
  ms = 10_000
): Promise<Trace> {
  const until = Date.now() + ms;
  for (;;) {
    const t = await trace(page);
    if (t && check(t)) return t;
    if (Date.now() > until)
      throw new Error(
        `timed out waiting for ${what}: ${t ? JSON.stringify(t.messages.slice(-5)) : "the emulator never started"}`
      );
    await new Promise((r) => setTimeout(r, 100));
  }
}

// Same geometry as LvglView's PIN pad (square 480): top 27%, 78% x 68%, gap 2.5%.
async function tapPinKey(page: Page, index: number): Promise<void> {
  const box = await page.locator("#screen").boundingBox();
  if (!box) throw new Error("no canvas");
  const scale = box.width / SIZE;
  const padW = Math.trunc(SIZE * 0.78);
  const padH = Math.trunc(SIZE * 0.68);
  const gap = Math.trunc(SIZE * 0.025);
  const left = (SIZE - padW) / 2;
  const top = Math.trunc(SIZE * 0.27);
  const cellW = (padW - 2 * gap) / 3;
  const cellH = (padH - 3 * gap) / 4;
  const x = left + (index % 3) * (cellW + gap) + cellW / 2;
  const y = top + Math.floor(index / 3) * (cellH + gap) + cellH / 2;
  await page.mouse.click(box.x + x * scale, box.y + y * scale, { delay: 80 });
  await page.waitForTimeout(200); // a person's pace: the pad registers every tap
}

// Pair with PIN 4829 and type it on the canvas (or the keyboard, on a notch), like a person would.
async function pairAndUnlock(
  { daemon, page }: Emulator,
  typed = false
): Promise<void> {
  const paired = await waitFor(
    page,
    (t) => t.messages.some((m) => m.op === "pair_code"),
    "a pairing code"
  );
  const code = paired.messages.find((m) => m.op === "pair_code")?.code ?? "";
  await page.waitForTimeout(1500); // let the boot animation finish so the pairing screen shows
  await page.screenshot({ path: join(SHOTS, "1-pairing.png") });
  await daemon.admin.pair({ code, pin: "4829", name: "pip" });
  await waitFor(
    page,
    (t) => t.messages.some((m) => m.op === "locked"),
    "the PIN pad"
  );
  await page.waitForTimeout(800); // the pad finishes appearing before the first tap
  await page.screenshot({ path: join(SHOTS, "2-pin.png") });
  if (typed) await page.keyboard.type("4829\n", { delay: 120 });
  else for (const index of [3, 7, 1, 8, 11]) await tapPinKey(page, index); // 4, 8, 2, 9, OK
  await waitFor(
    page,
    (t) => t.messages.some((m) => m.op === "unlocked"),
    "unlocked"
  );
  await page.waitForTimeout(500);
}

export { SHOTS, pairAndUnlock, startEmulator, waitFor };
export type { Emulator, Trace };
