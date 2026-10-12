// End to end: the battery indicator and the status screen (spec 009) on the emulated charm, driven
// from the side panel's battery controls and a mouse held on the face. Needs `npm run firmware:sim`
// and Google Chrome.
import { join } from "node:path";

import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type Emulator,
  SHOTS,
  pairAndUnlock,
  startEmulator,
  waitFor,
} from "./helpers";

let emulator: Emulator;

// Lit pixels in a band of the charm's screen (the canvas), to see the indicator without reading text.
async function litIn(page: Page, y0: number, y1: number): Promise<number> {
  return page.evaluate(
    ({ top, bottom }) => {
      // The page's canvas, typed by hand: this package has no browser types.
      type Canvas = {
        getContext: (kind: "2d") => {
          getImageData: (
            x: number,
            y: number,
            w: number,
            h: number
          ) => { data: ArrayLike<number> };
        };
      };
      const page = globalThis as unknown as {
        document: { getElementById: (id: string) => Canvas };
      };
      const data = page.document
        .getElementById("screen")
        .getContext("2d")
        .getImageData(120, top, 240, bottom - top).data;
      let lit = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i]! + data[i + 1]! + data[i + 2]! > 240) lit += 1;
      return lit;
    },
    { top: y0, bottom: y1 }
  );
}

async function screenCentre(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator("#screen").boundingBox();
  if (!box) throw new Error("no screen on the page");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

beforeAll(async () => {
  emulator = await startEmulator("hello");
  await pairAndUnlock(emulator);
}, 60_000);

afterAll(async () => {
  await emulator?.close();
});

describe("battery and status on the emulated charm", () => {
  it("hides the battery at rest and shows the level on a key press", async () => {
    const { page } = emulator;
    await page.locator("#battery").fill("42");
    await page.locator("#battery").blur(); // Space goes to the charm, not the slider
    await page.waitForTimeout(3500); // past the moment after unlocking
    expect(await litIn(page, 0, 60)).toBe(0);
    await page.keyboard.down("Space");
    await page.waitForTimeout(80);
    await page.keyboard.up("Space");
    await page.waitForTimeout(300);
    expect(await litIn(page, 0, 60)).toBeGreaterThan(100);
    await page.screenshot({ path: join(SHOTS, "battery-level.png") });
  });

  it("reports its battery to charmd, which shows it in status (spec 009)", async () => {
    const { daemon, page } = emulator;
    await page.locator("#battery").fill("57");
    await expect
      .poll(() => daemon.admin.status().charms[0]?.battery, { timeout: 5000 })
      .toEqual({ percent: 57, charging: false, usb: false });
  });

  it("keeps the level on screen while it's on USB", async () => {
    const { page } = emulator;
    await page.locator("#usb").click();
    await page.waitForTimeout(4000);
    expect(await litIn(page, 0, 60)).toBeGreaterThan(100);
    await page.locator("#usb").click();
  });

  it("opens the status screen on a one-second hold, and a click closes it", async () => {
    const { page } = emulator;
    const { x, y } = await screenCentre(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(400);
    expect((await waitFor(page, () => true, "a trace")).statusOpen).toBe(false);
    await page.waitForTimeout(900);
    await page.mouse.up();
    await waitFor(page, (t) => t.statusOpen, "the status screen");
    await page.screenshot({ path: join(SHOTS, "status.png") });
    await page.mouse.click(x, y);
    await waitFor(page, (t) => !t.statusOpen, "the face again");
  });
});
