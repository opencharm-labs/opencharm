import type { Colour, Face } from "@opencharm-labs/design/types";

import { renderScreen } from "./screen";
import { ESC, type Style } from "./terminal";

type AnimateOptions = {
  out: NodeJS.WriteStream;
  style: Style;
  signal: string;
  canAnimate: boolean;
  durationMs: number;
};

const BLINK_MS = 130;
const OPEN_MIN_MS = 900;
const OPEN_JITTER_MS = 700;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redraw(lines: readonly string[]): string {
  return `${ESC}${lines.length}A${lines.map((line) => `  ${line}${ESC}K`).join("\n")}\n`;
}

async function animateFace(
  face: Face,
  colour: Colour,
  { out, style, signal, canAnimate, durationMs }: AnimateOptions
): Promise<void> {
  const draw = (blink: boolean) =>
    renderScreen(face, colour, style, signal, { blink });
  out.write(
    `${draw(false)
      .map((line) => `  ${line}`)
      .join("\n")}\n`
  );
  if (!canAnimate) return;
  out.write(`${ESC}?25l`);
  const restoreCursor = () => out.write(`${ESC}?25h`);
  process.once("SIGINT", () => {
    restoreCursor();
    process.exit(130);
  });
  const end = Date.now() + durationMs;
  let blink = false;
  while (Date.now() < end) {
    await sleep(
      blink ? BLINK_MS : OPEN_MIN_MS + Math.random() * OPEN_JITTER_MS
    );
    blink = !blink;
    out.write(redraw(draw(blink)));
  }
  out.write(redraw(draw(false)));
  restoreCursor();
}

export { animateFace };
export type { AnimateOptions };
