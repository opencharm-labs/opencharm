import { describe, expect, it } from "vitest";

import { fitUtf8 } from "./text";

describe("fitUtf8", () => {
  it("leaves text that fits alone", () => {
    expect(fitUtf8("Allow?", 200)).toBe("Allow?");
  });

  it("cuts by bytes, the way the charm counts, ending with an ellipsis", () => {
    const fitted = fitUtf8("é".repeat(150), 200);
    expect(new TextEncoder().encode(fitted).length).toBeLessThanOrEqual(200);
    expect(fitted.endsWith("…")).toBe(true);
  });

  it("never splits a character, even an emoji", () => {
    const fitted = fitUtf8("🌱".repeat(80), 50);
    expect(fitted).toBe(`${"🌱".repeat(11)}…`);
  });
});
