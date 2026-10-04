import { describe, expect, it } from "vitest";

import { fromDescribe } from "./build-identity";

describe("the site's build identity (spec 015)", () => {
  it("is the release itself on a tagged commit", () => {
    expect(fromDescribe("web@0.3.1", "abc1234")).toEqual({
      version: "web@0.3.1",
      commit: "abc1234",
      text: "web@0.3.1 (abc1234)",
    });
  });

  it("counts the commits since the last release otherwise", () => {
    expect(fromDescribe("web@0.3.1-2-gabc1234", "abc1234").text).toBe(
      "web@0.3.1+2 (abc1234)"
    );
  });

  it("marks local changes", () => {
    expect(fromDescribe("web@0.3.1-2-gabc1234", "abc1234", true).text).toBe(
      "web@0.3.1+2 (abc1234-dirty)"
    );
  });

  it("marks local changes even without a release to count from", () => {
    expect(fromDescribe(undefined, "abc1234", true).text).toBe(
      "web@unknown (abc1234-dirty)"
    );
  });

  it("says unknown without a release to count from", () => {
    expect(fromDescribe(undefined, "abc1234").text).toBe(
      "web@unknown (abc1234)"
    );
  });
});
