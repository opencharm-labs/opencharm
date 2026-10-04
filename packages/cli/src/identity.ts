// What this build is (spec 015): `cli@<version> (<commit>)`. The version is package.json's, which CI
// stamps for a release (0.0.0 from source); the commit is injected by tsdown at build time, or read
// from git when running from source.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pkg from "../package.json" with { type: "json" };

type Identity = { version: string; commit: string; text: string };

declare const __OPENCHARM_COMMIT__: string | undefined;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

// OPENCHARM_COMMIT when CI sets it (exact even after CI stamps a version into package.json); else the
// short commit at cwd, "-dirty" with tracked changes, "unknown" without git or a checkout. The same
// rule as the desktop app's build.rs, the firmware's CMake and the website.
function gitCommit(cwd: string): string {
  if (process.env.OPENCHARM_COMMIT) return process.env.OPENCHARM_COMMIT;
  try {
    const commit = git(cwd, "rev-parse", "--short", "HEAD");
    const dirty =
      git(cwd, "status", "--porcelain", "--untracked-files=no").length > 0;
    return dirty ? `${commit}-dirty` : commit;
  } catch {
    return "unknown";
  }
}

// Which starter commit a workspace began from: `init` keeps the starter as the `upstream` remote, so
// it's the last commit the workspace shares with it. Only a workspace counts (opencharm.json at the
// repo's root), not any repo with an upstream remote, like a fork. Nothing is written for this.
function starterCommit(dir: string): string | undefined {
  try {
    if (
      !existsSync(
        join(git(dir, "rev-parse", "--show-toplevel"), "opencharm.json")
      )
    )
      return undefined;
    return git(
      dir,
      "rev-parse",
      "--short",
      git(dir, "merge-base", "HEAD", "upstream/HEAD")
    );
  } catch {
    return undefined;
  }
}

function formatIdentity(unit: string, version: string, commit: string): string {
  return `${unit}@${version} (${commit})`;
}

let cached: Identity | undefined;

// Computed once: running from source, it asks git.
function identity(): Identity {
  if (cached) return cached;
  const commit =
    typeof __OPENCHARM_COMMIT__ === "string"
      ? __OPENCHARM_COMMIT__
      : gitCommit(dirname(fileURLToPath(import.meta.url)));
  const version = `cli@${pkg.version}`;
  cached = { version, commit, text: `${version} (${commit})` };
  return cached;
}

export { formatIdentity, gitCommit, identity, starterCommit };
export type { Identity };
