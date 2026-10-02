import type { Colour, Face } from "@opencharm-labs/design/types";

import { glyph } from "./face-lookup";
import type { Style } from "./terminal";

type ScreenOptions = { blink?: boolean };

// Odd width so the mouth sits exactly in the middle column.
const INNER = 21;
const ROWS = 5;
const EYE_LEFT = 5;
const EYE_RIGHT = 15;
const MIDDLE = 10;
const EYE_ROW = 2;
const MOUTH_ROW = 3;
const BLINK_GLYPH = "−";
const SCREEN_BLACK = "#000000";

function renderScreen(
  face: Face,
  colour: Colour,
  style: Style,
  signal: string,
  { blink = false }: ScreenOptions = {}
): string[] {
  // Orange on the frame means one thing only: it needs you.
  const ring = face.fx === "ask" ? style.fg(signal) : style.fg(colour.c);
  const ink = style.fg(colour.g);
  const black = style.bg(SCREEN_BLACK);
  const left = blink ? BLINK_GLYPH : glyph(face.L);
  const right = blink ? BLINK_GLYPH : glyph(face.R);
  const lines = [`${ring}╭${"─".repeat(INNER)}╮${style.reset}`];
  for (let row = 0; row < ROWS; row++) {
    const cells = new Array<string>(INNER).fill(" ");
    if (row === EYE_ROW) {
      cells[EYE_LEFT] = left;
      cells[EYE_RIGHT] = right;
    }
    if (row === MOUTH_ROW && face.M) cells[MIDDLE] = face.M;
    if (row === 0 && face.fx === "z") cells[INNER - 3] = "z";
    lines.push(
      `${ring}│${style.reset}${black}${ink}${style.bold(cells.join(""))}${style.reset}${ring}│${style.reset}`
    );
  }
  lines.push(`${ring}╰${"─".repeat(INNER)}╯${style.reset}`);
  return lines;
}

export { renderScreen };
