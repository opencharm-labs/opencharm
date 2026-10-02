// End to end: the agent asks permission mid-turn; the emulator shows the question (decision layout),
// a hold answers yes and a press answers no. Needs `npm run firmware:sim` and Google Chrome.
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type Emulator,
  SHOTS,
  type Trace,
  pairAndUnlock,
  startEmulator,
  waitFor,
} from "./helpers";

let emulator: Emulator;

// Hold the key to talk; the fake voice hears "permission please", so the fake agent asks.
async function askingTurn(): Promise<Trace> {
  const { page } = emulator;
  const before = (await waitFor(page, () => true, "a trace")).messages.length;
  await page.keyboard.down("Space");
  await page.waitForTimeout(1200);
  await page.keyboard.up("Space");
  return waitFor(
    page,
    (t) => t.messages.slice(before).some((m) => m.op === "ask"),
    "a question on the charm",
    15_000
  );
}

async function spoken(text: string): Promise<void> {
  await waitFor(
    emulator.page,
    (t) =>
      t.messages.some(
        (m) =>
          m.type === "tts" && m.state === "sentence_start" && m.text === text
      ),
    `the agent saying "${text}"`,
    15_000
  );
}

beforeAll(async () => {
  emulator = await startEmulator("permission please");
  await pairAndUnlock(emulator);
}, 60_000);

afterAll(async () => {
  await emulator?.close();
});

describe("questions on the emulated charm", () => {
  it("shows the agent's question, and a hold answers yes", async () => {
    const { page } = emulator;
    const asked = await askingTurn();
    const question = asked.messages.filter((m) => m.op === "ask").at(-1);
    expect(question?.text).toBe("Your agent wants to edit AGENTS.md.");
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SHOTS, "5-ask.png") });
    await page.keyboard.down("Space");
    await page.waitForTimeout(600);
    await page.keyboard.up("Space");
    await spoken("Done.");
  }, 60_000);

  it("a short press answers no", async () => {
    const { page } = emulator;
    await waitFor(
      page,
      (t) =>
        t.messages.at(-1)?.op === "face" && t.messages.at(-1)?.state === "idle",
      "back to idle"
    );
    await askingTurn();
    await page.waitForTimeout(300);
    await page.keyboard.press("Space", { delay: 60 });
    await spoken("Not allowed.");
  }, 60_000);
});
