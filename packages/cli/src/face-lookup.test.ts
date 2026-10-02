import { describe, expect, it, vi } from "vitest";

import { faceText, findFace, pickColour } from "./face-lookup";

describe("findFace", () => {
  it("finds a face by id", () => {
    expect(findFace("learned")?.id).toBe("learned");
  });

  it("finds a face by its title, ignoring case", () => {
    expect(findFace("neutral")?.t).toBe("Neutral");
    expect(findFace("NEUTRAL")?.id).toBe("neutral");
  });

  it("returns undefined for an unknown mood", () => {
    expect(findFace("grumpy")).toBeUndefined();
  });
});

describe("faceText", () => {
  it("drops the emoji-blocking variation selector terminals don't need", () => {
    const loved = findFace("loved");
    expect(loved).toBeDefined();
    expect(faceText(loved!)).not.toContain("︎");
  });
});

describe("pickColour", () => {
  it("defaults to white", () => {
    expect(pickColour([], vi.fn()).id).toBe("white");
  });

  it("accepts --color as well as --colour", () => {
    expect(pickColour(["--color", "coal"], vi.fn()).id).toBe("coal");
  });

  it("warns and falls back to white for an unknown colour", () => {
    const warn = vi.fn();
    expect(pickColour(["--colour", "pink"], warn).id).toBe("white");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Unknown colour "pink"')
    );
  });
});
