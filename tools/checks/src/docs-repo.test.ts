import { statSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readRepoFile, repoPath, walkRepo } from "./repo";

const BANNED_NAME = /muse/i;
const MAX_PRODUCT_LINES = 350;
// Paths that moved when the repo was set up; specs/ keeps them as history, everything else must not.
const STALE_PATH =
  /tools\/build_(?:icon|prototype)\.py|tools\/export_design_data|assets\/(?:charm-face|vendor)|(?<![\w/])design\/(?:faces|tokens)\.json|MOCKUP\.html|cli\/(?:bin|data)\/|docs\/specs\/|bridge\/README/;
const TEXT_FILE = /\.(?:md|ts|mjs|js|json|html|py|yml|toml)$/;
const HISTORY_OR_THIRD_PARTY =
  /^(?:specs\/|LICENSES\/|hardware\/reference\/|hardware\/prototype\/vendor\/|package-lock\.json$)/;

describe("public docs", () => {
  it("README keeps the no-warranty notice", () => {
    expect(readRepoFile("README.md")).toMatch(/no warranty/i);
  });

  it("README states that we sell nothing", () => {
    expect(readRepoFile("README.md")).toMatch(/we sell nothing/i);
  });

  it(`keeps OPENCHARM.md at ${MAX_PRODUCT_LINES} lines or fewer (the product, not every component's detail)`, () => {
    // Detail lives in the README next to its code; the specs index lives in specs/README.md.
    expect(readRepoFile("OPENCHARM.md").split("\n").length).toBeLessThanOrEqual(
      MAX_PRODUCT_LINES
    );
  });

  it("has no references to paths that moved when the repo was set up", () => {
    const stale = walkRepo()
      .filter((path) => TEXT_FILE.test(path))
      // Only files: a Next.js route folder such as app/version.json/ ends in .json too.
      .filter((path) => statSync(repoPath(path)).isFile())
      .filter((path) => !HISTORY_OR_THIRD_PARTY.test(path))
      .filter((path) => STALE_PATH.test(readRepoFile(path)));
    expect(stale).toEqual([]);
  });

  it("never uses 'Muse' in a file or folder name", () => {
    expect(walkRepo().filter((path) => BANNED_NAME.test(path))).toEqual([]);
  });
});
