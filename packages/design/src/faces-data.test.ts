import { describe, expect, it } from "vitest";

import { facesData } from "./faces-data";

const HEX = /^#[0-9A-F]{6}$/i;
const EFFECTS = new Set(["cursor", "spin", "z", "ask"]);

describe("faces data", () => {
  it("reserves orange #FF5A1F as the needs-you signal", () => {
    expect(facesData.signal).toBe("#FF5A1F");
  });

  it("gives every face a unique id", () => {
    const ids = facesData.faces.map((face) => face.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points every agent state at a face that exists", () => {
    const ids = new Set(facesData.faces.map((face) => face.id));
    for (const state of facesData.states) {
      expect(ids.has(state.face), `${state.id} → ${state.face}`).toBe(true);
    }
  });

  it("uses six-digit hex for every colour", () => {
    for (const colour of facesData.colours) {
      for (const hex of [colour.c, colour.g, colour.key]) {
        expect(hex, colour.id).toMatch(HEX);
      }
    }
  });

  it("only uses known face effects", () => {
    for (const face of facesData.faces) {
      if (face.fx) expect(EFFECTS.has(face.fx), face.id).toBe(true);
    }
  });

  it("starts the colour list with white, the default charm", () => {
    expect(facesData.colours[0]?.id).toBe("white");
  });
});
