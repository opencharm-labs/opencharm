import { describe, expect, it } from "vitest";

import { createStyle, detectStyleOptions, rgbTo256 } from "./terminal";

describe("detectStyleOptions", () => {
  it("turns colour off when output is piped", () => {
    expect(detectStyleOptions([], {}, false).color).toBe(false);
  });

  it("turns colour off with NO_COLOR even on a terminal", () => {
    expect(detectStyleOptions([], { NO_COLOR: "" }, true).color).toBe(false);
  });

  it("turns colour off with --no-color", () => {
    expect(detectStyleOptions(["--no-color"], {}, true).color).toBe(false);
  });

  it("turns colour off on a dumb terminal", () => {
    expect(detectStyleOptions([], { TERM: "dumb" }, true).color).toBe(false);
  });

  it("uses true colour when COLORTERM says so", () => {
    expect(
      detectStyleOptions([], { COLORTERM: "truecolor" }, true).trueColor
    ).toBe(true);
  });
});

describe("createStyle", () => {
  it("emits no escape codes when colour is off", () => {
    const style = createStyle({ color: false, trueColor: true });
    expect(style.fg("#FF5A1F")).toBe("");
    expect(style.bold("x")).toBe("x");
    expect(style.reset).toBe("");
  });

  it("emits a 24-bit sequence in true colour", () => {
    expect(createStyle({ color: true, trueColor: true }).fg("#FF5A1F")).toBe(
      "\x1b[38;2;255;90;31m"
    );
  });

  it("maps to the 256-colour cube otherwise", () => {
    expect(rgbTo256([255, 90, 31])).toBe(202);
  });
});
