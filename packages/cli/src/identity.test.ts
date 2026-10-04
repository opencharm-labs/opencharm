import { describe, expect, it } from "vitest";

import { formatIdentity, gitCommit, identity } from "./identity";

describe("identity", () => {
  it("reads unit@version (commit), the tag's own form", () => {
    expect(formatIdentity("cli", "0.2.0", "abc1234")).toBe(
      "cli@0.2.0 (abc1234)"
    );
  });

  it("knows the CLI's version and the commit it runs from", () => {
    const id = identity();
    expect(id.version).toMatch(/^cli@\d+\.\d+\.\d+$/);
    expect(id.commit).toMatch(/^([0-9a-f]{7,}(-dirty)?|unknown)$/);
    expect(id.text).toBe(`${id.version} (${id.commit})`);
  });

  it("says unknown outside a git checkout", () => {
    expect(gitCommit("/")).toBe("unknown");
  });
});
