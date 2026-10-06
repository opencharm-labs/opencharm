import { describe, expect, it } from "vitest";
import { BEATS, DURATION, FPS, FRAMES_PER_BEAT, beat } from "./track";

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

  it("measures a beat in frames at the track's tempo", () => {
    expect(FRAMES_PER_BEAT).toBe(beat(1) - beat(0));
  });
});
