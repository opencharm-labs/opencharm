// End to end: the real emulator (firmware/core in WebAssembly) in headless Chrome, talking to a real
// charmd over WebSocket, which talks ACP to an agent process, with a fake microphone.
// Needs `npm run firmware:sim` and Google Chrome. Run: npm run test:e2e -w packages/cli
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type Emulator,
  SHOTS,
  pairAndUnlock,
  startEmulator,
  waitFor,
} from "./helpers";

let emulator: Emulator;

beforeAll(async () => {
  emulator = await startEmulator("what's the weather");
}, 60_000);

afterAll(async () => {
  await emulator?.close();
});

describe("the emulator against a real charmd", () => {
  it("pairs, unlocks with the PIN pad, and completes a spoken turn", async () => {
    const { page } = emulator;
    await pairAndUnlock(emulator);
    await page.screenshot({ path: join(SHOTS, "3-face.png") });

    // It says what it runs (spec 015): in its side panel, and to charmd in hello.
    expect(await page.locator("#build").textContent()).toMatch(
      /^cli@\d+\.\d+\.\d+ \(([0-9a-f]{7,}(-dirty)?|unknown)\)$/
    );
    expect(emulator.daemon.admin.status().charms[0]?.build).toMatchObject({
      kind: "emulator",
      version: expect.stringMatching(/^cli@/),
    });

    // The microphone is closed until the key goes down, open while it's held, closed after.
    await page.waitForTimeout(500);
    const before = await waitFor(page, () => true, "a trace");
    expect(before.micReady).toBe(false);
    expect(before.micOpens).toBe(0);
    await page.keyboard.down("Space");
    await waitFor(page, (t) => t.micReady, "the microphone opening");
    await page.waitForTimeout(1500);
    await page.keyboard.up("Space");
    await waitFor(page, (t) => !t.micReady, "the microphone closing", 2000);
    const done = await waitFor(
      page,
      (t) => t.messages.some((m) => m.type === "tts" && m.state === "stop"),
      "the spoken answer",
      15_000
    );
    await page.screenshot({ path: join(SHOTS, "4-speaking.png") });
    expect(done.micFrames).toBeGreaterThan(5);
    expect(done.messages).toContainEqual(
      expect.objectContaining({ type: "stt", text: "what's the weather" })
    );
    expect(done.messages).toContainEqual(
      expect.objectContaining({
        type: "tts",
        state: "sentence_start",
        text: "You said: what's the weather.",
      })
    );
    expect(done.audioFrames).toBeGreaterThan(0);
    await waitFor(
      page,
      (t) => t.messages.some((m) => m.op === "face" && m.state === "idle"),
      "back to idle"
    );
  }, 60_000);

  it("reconnects with its stored token after a reload and asks for the PIN, not a new pairing", async () => {
    const { page } = emulator;
    await page.reload();
    const back = await waitFor(
      page,
      (t) => t.messages.length > 1,
      "the first messages after the reload"
    );
    expect(back.messages.some((m) => m.op === "pair_code")).toBe(false);
    await waitFor(
      page,
      (t) => t.messages.some((m) => m.op === "locked"),
      "the PIN pad"
    );
  }, 30_000);
});
