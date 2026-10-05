// End to end: the desktop charm's notch layout in the emulator (spec 013). The PIN is typed on the
// keyboard, the panel opens below the notch while it speaks and closes after.
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
  emulator = await startEmulator("what's the weather", "?shape=notch", {
    desktop: true,
  });
}, 60_000);

afterAll(async () => {
  await emulator?.close();
});

describe("the desktop charm under a notch", () => {
  it("unlocks with a typed PIN, opens its panel to speak, and closes it after", async () => {
    const { page } = emulator;
    await pairAndUnlock(emulator, true);
    await page.waitForTimeout(2000); // the greeting closes the panel again
    expect((await waitFor(page, () => true, "a trace")).panelOpen).toBe(false);
    await page.screenshot({ path: join(SHOTS, "6-notch-compact.png") });

    await page.keyboard.down("Space");
    await page.waitForTimeout(1500);
    await page.keyboard.up("Space");
    await waitFor(
      page,
      (t) =>
        t.panelOpen === true &&
        t.messages.some(
          (m) => m.type === "tts" && m.state === "sentence_start"
        ),
      "the panel open while it speaks",
      15_000
    );
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(SHOTS, "7-notch-speaking.png") });
    await waitFor(
      page,
      (t) => t.panelOpen === false,
      "the panel closing",
      15_000
    );
  }, 60_000);

  it("sends typed text and shows the reply as text, with no audio (spec 013)", async () => {
    const { page } = emulator;
    const before = (await waitFor(page, () => true, "a trace")).messages.length;
    // What the desktop page calls when Enter is pressed in its field.
    const result = await page.evaluate(() =>
      (
        globalThis as unknown as {
          charmSim: { type: (text: string) => string };
        }
      ).charmSim.type("Che tempo fa domani?")
    );
    expect(result).toBe("sent");
    const trace = await waitFor(
      page,
      (t) =>
        t.panelOpen === true &&
        t.messages.some(
          (m) =>
            m.type === "tts" &&
            m.state === "sentence_start" &&
            m.text === "You said: Che tempo fa domani?."
        ),
      "the typed question's reply shown as text",
      15_000
    );
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS, "8-notch-typed-reply.png") });
    // No transcript: nothing was listened to.
    expect(trace.messages.slice(before).some((m) => m.type === "stt")).toBe(
      false
    );
  }, 60_000);

  it("keys typed into a text field stay text: spaces aren't the talk key, digits aren't the PIN", async () => {
    const { page } = emulator;
    const opens = (await waitFor(page, () => true, "a trace")).micOpens;
    // A text field like the desktop app's, focused.
    await page.evaluate(
      "const f = document.createElement('input'); f.id = 'e2e-field'; document.body.append(f); f.focus();"
    );
    await page.keyboard.type("che tempo fa 12");
    expect(await page.inputValue("#e2e-field")).toBe("che tempo fa 12");
    await page.waitForTimeout(500);
    expect((await waitFor(page, () => true, "a trace")).micOpens).toBe(opens);
  }, 60_000);
});
