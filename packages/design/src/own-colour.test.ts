import { describe, expect, it } from "vitest";

import { OWN_COLOUR, ownColourProblem } from "./own-colour";

describe("a colour of your own", () => {
  it.each([
    "#FF6EC7",
    "#FF0000",
    "#FFD400",
    "#FFB800",
    "#3F7BFF",
    "#8A8A8A",
    "#F7C59F",
    "#ff6ec7",
  ])("takes %s, which reads on black and isn't the needs-you orange", (hex) => {
    expect(ownColourProblem(hex)).toBeUndefined();
  });

  it.each([
    ["#FF5A1F", /orange/],
    ["#F26B2A", /orange/],
    ["#E0480F", /orange/],
    ["#FFA500", /orange/],
    ["#FF8C00", /orange/],
    ["#202020", /dark/],
    ["#000000", /dark/],
  ])("refuses %s", (hex, problem) => {
    expect(ownColourProblem(hex)).toMatch(problem);
  });

  it("is written #RRGGBB", () => {
    expect(OWN_COLOUR.test("#A1b2C3")).toBe(true);
    expect(OWN_COLOUR.test("#FFF")).toBe(false);
    expect(OWN_COLOUR.test("pink")).toBe(false);
  });
});
