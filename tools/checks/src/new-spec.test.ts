import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as prettier from "prettier";
import { afterEach, describe, expect, it } from "vitest";

import { createSpec } from "./new-spec";
import { repoPath } from "./repo";

const cleanups: string[] = [];

function copyOfSpecs(): string {
  const dir = mkdtempSync(join(tmpdir(), "oc-specs-"));
  cleanups.push(dir);
  cpSync(repoPath("specs", "_template"), join(dir, "_template"), {
    recursive: true,
  });
  cpSync(repoPath("specs", "README.md"), join(dir, "README.md"));
  cpSync(repoPath("specs", "001-protocol"), join(dir, "001-a"), {
    recursive: true,
  });
  return dir;
}

afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true });
});

describe("createSpec", () => {
  it("leaves specs/README.md formatted, so npm run check stays green", async () => {
    const dir = copyOfSpecs();
    await createSpec(dir, "new-thing");
    const readme = join(dir, "README.md");
    const options = await prettier.resolveConfig(
      repoPath("specs", "README.md")
    );
    expect(
      await prettier.check(readFileSync(readme, "utf8"), {
        ...options,
        filepath: readme,
      })
    ).toBe(true);
    expect(existsSync(join(dir, "002-new-thing", "spec.md"))).toBe(true);
  });

  it("writes nothing when the index table is missing", async () => {
    const dir = copyOfSpecs();
    cpSync(repoPath("specs", "_template", "spec.md"), join(dir, "README.md"));
    await expect(createSpec(dir, "new-thing")).rejects.toThrow(/index rows/);
    expect(existsSync(join(dir, "002-new-thing"))).toBe(false);
  });
});
