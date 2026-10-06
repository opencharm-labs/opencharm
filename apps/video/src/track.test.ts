import { describe, expect, it } from "vitest";
import { BEATS, DURATION, FPS, beat, beatAt } from "./track";

describe("the film's beat clock", () => {
  it("keeps the film between 30 and 45 seconds", () => {
    expect(DURATION / FPS).toBeGreaterThanOrEqual(30);
    expect(DURATION / FPS).toBeLessThanOrEqual(45);
  });

  it("puts every beat on a whole frame, in order", () => {
    for (let b = 1; b <= BEATS; b++) {
      expect(Number.isInteger(beat(b))).toBe(true);
      expect(beat(b)).toBeGreaterThan(beat(b - 1));
    }
  });

  it("finds the beat a frame is in, and how far into it", () => {
    for (let b = 0; b < BEATS; b++) {
      expect(beatAt(beat(b))).toEqual({ index: b, since: 0 });
      expect(beatAt(beat(b + 1) - 1).index).toBe(b);
    }
  });
});
