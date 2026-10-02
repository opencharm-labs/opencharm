import { describe, expect, it } from "vitest";

import { toBuffer } from "./raw-data";

describe("toBuffer", () => {
  it("passes a Buffer through", () => {
    const buffer = Buffer.from("hi");
    expect(toBuffer(buffer)).toBe(buffer);
  });

  it("joins fragments", () => {
    expect(toBuffer([Buffer.from("a"), Buffer.from("b")]).toString()).toBe(
      "ab"
    );
  });

  it("wraps an ArrayBuffer", () => {
    expect(toBuffer(new TextEncoder().encode("ok").buffer).toString()).toBe(
      "ok"
    );
  });
});
