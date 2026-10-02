import { facesData } from "@opencharm-labs/design/faces";
import { describe, expect, it } from "vitest";

import {
  AUDIO_DOWN,
  AUDIO_UP,
  FACE_STATES,
  LIMITS,
  TIMEOUTS,
} from "./constants";

describe("protocol constants", () => {
  it("uses exactly the agent state ids from the design package as face states", () => {
    expect([...FACE_STATES]).toEqual(facesData.states.map((s) => s.id));
  });

  it("sends 16 kHz mono Opus in 60 ms frames and plays 24 kHz back", () => {
    expect(AUDIO_UP).toEqual({
      format: "opus",
      sample_rate: 16000,
      channels: 1,
      frame_duration: 60,
    });
    expect(AUDIO_DOWN.sample_rate).toBe(24000);
  });

  it("keeps every limit and timeout positive", () => {
    for (const value of [
      ...Object.values(LIMITS),
      ...Object.values(TIMEOUTS),
    ]) {
      expect(value).toBeGreaterThan(0);
    }
  });
});
