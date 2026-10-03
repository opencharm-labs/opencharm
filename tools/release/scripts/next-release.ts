// Used by the release workflows, on plain Node 24 (no install): `node tools/release/scripts/next-release.ts <cli|desktop> [--head <sha>]
// [--notes <file>]`. Prints the plan; in GitHub Actions also sets the outputs version, tag and previous
// (version and tag empty when there is nothing to release) and writes the release notes to --notes.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

import {
  type Git,
  type RawCommit,
  type Unit,
  UNITS,
  planRelease,
} from "../src/next-release.ts";

const FIELD = "\x1f";
const RECORD = "\x1e";
const USAGE = `Usage: next-release <${Object.keys(UNITS).join("|")}> [--head <sha>] [--notes <file>]`;

function options() {
  return parseArgs({
    allowPositionals: true,
    strict: true,
    options: { head: { type: "string" }, notes: { type: "string" } },
  });
}

// Generous: squash commits carry their branch's messages, and releases can be far apart.
function git(...args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

function repository(head: string): Git {
  return {
    tags: () => git("tag", "--list").split("\n").filter(Boolean),
    commitsSince: (tag, paths) =>
      git(
        "log",
        `--format=%H${FIELD}%s${FIELD}%b${RECORD}`,
        `${tag}..${head}`,
        "--",
        ...paths
      )
        .split(RECORD)
        .map((record) => record.trim())
        .filter(Boolean)
        .map((record): RawCommit => {
          const [sha = "", subject = "", body = ""] = record.split(FIELD);
          return { sha, subject, body };
        }),
  };
}

let parsed: ReturnType<typeof options>;
try {
  parsed = options();
} catch (error) {
  console.error(`${(error as Error).message}\n${USAGE}`);
  process.exit(2);
}
const unit = parsed.positionals[0] as Unit;
if (parsed.positionals.length !== 1 || !Object.hasOwn(UNITS, unit)) {
  console.error(USAGE);
  process.exit(2);
}
const plan = planRelease(
  unit,
  process.env.GITHUB_REPOSITORY ?? "opencharm-labs/opencharm",
  repository(parsed.values.head ?? "HEAD")
);
console.log(
  plan.version
    ? `${unit}: ${plan.previous} → ${plan.version}\n\n${plan.notes}`
    : `${unit}: nothing to release since ${unit}@${plan.previous}`
);
const notes = parsed.values.notes;
if (notes) {
  mkdirSync(dirname(notes), { recursive: true });
  writeFileSync(notes, plan.notes);
}
if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${plan.version ?? ""}\ntag=${plan.tag ?? ""}\nprevious=${plan.previous}\n`
  );
