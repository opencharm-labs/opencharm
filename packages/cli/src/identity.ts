// What this build is (spec 015): `cli@<version> (<commit>)`. The version is package.json's, which CI
// stamps for a release (0.0.0 from source); the commit is injected by tsdown at build time, or read
// from git when running from source.
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
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

// The short commit at cwd, "-dirty" with uncommitted changes, "unknown" without git or a checkout.
function gitCommit(cwd: string): string {
  try {
    const commit = git(cwd, "rev-parse", "--short", "HEAD");
    const dirty = git(cwd, "status", "--porcelain").length > 0;
    return dirty ? `${commit}-dirty` : commit;
  } catch {
    return "unknown";
  }
}

// Which starter commit a workspace began from: `init` keeps the starter as the `upstream` remote, so
// it's the last commit the workspace shares with it; undefined outside a starter workspace. Nothing
// is written to the workspace for this (spec 015).
function starterCommit(dir: string): string | undefined {
  try {
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

function identity(): Identity {
  const commit =
    typeof __OPENCHARM_COMMIT__ === "string"
      ? __OPENCHARM_COMMIT__
      : gitCommit(dirname(fileURLToPath(import.meta.url)));
  const version = `cli@${pkg.version}`;
  return { version, commit, text: `${version} (${commit})` };
}

export { formatIdentity, gitCommit, identity, starterCommit };
export type { Identity };
