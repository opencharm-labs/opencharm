import { describe, expect, it } from "vitest";

import { firstPositional, parseArgs } from "./args";

describe("parseArgs", () => {
  it("takes the first word that is not a flag or a flag value as the command", () => {
    expect(parseArgs(["--colour", "lime", "face", "happy"])).toEqual({
      command: "face",
      rest: ["--colour", "lime", "happy"],
      help: false,
      version: false,
    });
  });

  it("returns an empty command when only flags are given", () => {
    expect(parseArgs(["--no-anim"]).command).toBe("");
  });

  it("lowercases the command", () => {
    expect(parseArgs(["FACES"]).command).toBe("faces");
  });

  it("detects help and version flags anywhere", () => {
    expect(parseArgs(["faces", "-h"]).help).toBe(true);
    expect(parseArgs(["--version"]).version).toBe(true);
  });
});

describe("firstPositional", () => {
  it("skips the value of --color", () => {
    expect(firstPositional(["--color", "coal", "learned"])).toBe("learned");
  });

  it("skips the values of --greeting and --motion, even an empty greeting", () => {
    expect(
      firstPositional(["--greeting", "", "--motion", "calm", "look"])
    ).toBe("look");
  });

  it("returns undefined when there is no positional word", () => {
    expect(firstPositional(["--no-anim"])).toBeUndefined();
  });
});
