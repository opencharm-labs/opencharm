import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ParseErrorCode } from "./parse";

type FixtureFile = {
  direction: "client" | "server";
  message?: unknown;
  raw?: string;
  error?: ParseErrorCode;
};
type Fixture = {
  name: string;
  direction: "client" | "server";
  raw: string;
  error?: ParseErrorCode;
};

// The same folder is read by the C++ core's tests (spec 005), so both sides agree on every message.
const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures"
);

function loadFixtures(kind: "valid" | "invalid"): Fixture[] {
  const dir = join(FIXTURES_DIR, kind);
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const data = JSON.parse(
        readFileSync(join(dir, file), "utf8")
      ) as FixtureFile;
      return {
        name: file.replace(/\.json$/, ""),
        direction: data.direction,
        raw: data.raw ?? JSON.stringify(data.message),
        ...(data.error ? { error: data.error } : {}),
      };
    });
}

export { FIXTURES_DIR, loadFixtures };
export type { Fixture };
