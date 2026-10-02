import { facesData } from "@opencharm-labs/design/faces";
import type { Face } from "@opencharm-labs/design/types";
import { describe, expect, it } from "vitest";

import { findFace } from "./face-lookup";
import { renderScreen } from "./screen";
import { createStyle } from "./terminal";

const PLAIN = createStyle({ color: false, trueColor: false });
const COLOURED = createStyle({ color: true, trueColor: true });
const SIGNAL = "#FF5A1F";
const WHITE = facesData.colours[0]!;

function face(id: string): Face {
  const found = findFace(id);
  if (!found) throw new Error(`missing face ${id}`);
  return found;
}

describe("renderScreen", () => {
  it("draws seven lines with the eyes on the middle row", () => {
    const lines = renderScreen(face("neutral"), WHITE, PLAIN, SIGNAL);
    expect(lines).toHaveLength(7);
    expect(lines[3]).toBe("│     o         o     │");
  });

  it("closes both eyes when blinking", () => {
    const lines = renderScreen(face("neutral"), WHITE, PLAIN, SIGNAL, {
      blink: true,
    });
    expect(lines[3]).toBe("│     −         −     │");
  });

  it("puts the mouth in the middle column", () => {
    const lines = renderScreen(face("joy"), WHITE, PLAIN, SIGNAL);
    expect(lines[4]).toBe("│          v          │");
  });

  it("paints the frame orange only for the ask face", () => {
    const orange = "\x1b[38;2;255;90;31m";
    expect(
      renderScreen(face("ask"), WHITE, COLOURED, SIGNAL)[0]?.startsWith(orange)
    ).toBe(true);
    expect(
      renderScreen(face("neutral"), WHITE, COLOURED, SIGNAL)[0]?.startsWith(
        orange
      )
    ).toBe(false);
  });
});
