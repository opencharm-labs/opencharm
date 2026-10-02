import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import tsdownConfig from "../tsdown.config";

const PACKAGE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "package.json"
);

describe("the published bundle", () => {
  it("keeps every runtime dependency external (inlined, opusscript can't find its WebAssembly)", () => {
    const { dependencies = {} } = JSON.parse(readFileSync(PACKAGE, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const external = (tsdownConfig as { external?: string[] }).external ?? [];
    expect([...external].sort()).toEqual(Object.keys(dependencies).sort());
  });
});
