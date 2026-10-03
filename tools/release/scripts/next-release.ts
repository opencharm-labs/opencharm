// Used by the release workflows: `tsx tools/release/scripts/next-release.ts <cli|desktop> [--head <sha>]
// [--notes <file>]`. Prints the plan; in GitHub Actions also sets the outputs version, tag and previous
// (version and tag empty when there is nothing to release) and writes the release notes to --notes.
import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";

import {
  type Git,
  type RawCommit,
  type Unit,
  UNITS,
  planRelease,
} from "../src/next-release";

const FIELD = "\x1f";
const RECORD = "\x1e";

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
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

const unit = process.argv[2] as Unit;
if (!(unit in UNITS)) {
  console.error(
    `Usage: next-release <${Object.keys(UNITS).join("|")}> [--head <sha>] [--notes <file>]`
  );
  process.exit(2);
}
const plan = planRelease(
  unit,
  process.env.GITHUB_REPOSITORY ?? "opencharm-labs/opencharm",
  repository(flag("--head") ?? "HEAD")
);
console.log(
  plan.version
    ? `${unit}: ${plan.previous} → ${plan.version}\n\n${plan.notes}`
    : `${unit}: nothing to release since ${unit}@${plan.previous}`
);
const notes = flag("--notes");
if (notes) writeFileSync(notes, plan.notes);
if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${plan.version ?? ""}\ntag=${plan.tag ?? ""}\nprevious=${plan.previous}\n`
  );
