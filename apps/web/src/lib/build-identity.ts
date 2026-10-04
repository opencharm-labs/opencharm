// What this deploy of the site is (spec 015): `web@<version> (<commit>)`, from the latest web@ tag.
// A deploy that isn't a release counts the commits since it: `web@0.3.1+2 (abc1234)`. Computed once
// at build time (next.config.ts); Vercel deploys each merge before CI tags it, so a release's own
// deploy shows the previous version until the next one (maintainer, 4 October 2026).
import { execFileSync } from "node:child_process";

type BuildIdentity = { version: string; commit: string; text: string };

const DESCRIBE = /^(web@\d+\.\d+\.\d+)(?:-(\d+)-g[0-9a-f]+)?$/;

function git(...args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function fromDescribe(
  describe: string | undefined,
  commit: string,
  dirtyTree = false
): BuildIdentity {
  const match = describe ? DESCRIBE.exec(describe) : null;
  const dirty = dirtyTree ? "-dirty" : "";
  const version = match?.[1]
    ? `${match[1]}${match[2] ? `+${match[2]}` : ""}`
    : "web@unknown";
  const full = `${commit}${dirty}`;
  return { version, commit: full, text: `${version} (${full})` };
}

// OPENCHARM_COMMIT when CI sets it, else git (Vercel's commit variable without it). Vercel clones
// without tags (and shallow), so on CI or Vercel only, fetch them first; never on a contributor's
// machine. "-dirty" means tracked changes, as everywhere.
function buildIdentity(): BuildIdentity {
  const fromCi = process.env.OPENCHARM_COMMIT || undefined;
  const commit =
    fromCi ??
    git("rev-parse", "--short", "HEAD") ??
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
    "unknown";
  const describe = () => git("describe", "--tags", "--match", "web@*");
  let found = describe();
  if (!found && (process.env.VERCEL || process.env.CI)) {
    if (git("fetch", "--quiet", "--tags", "--unshallow") === undefined)
      git("fetch", "--quiet", "--tags");
    found = describe();
  }
  const dirty =
    !fromCi &&
    (git("status", "--porcelain", "--untracked-files=no") ?? "").length > 0;
  return fromDescribe(found, commit, dirty);
}

export { buildIdentity, fromDescribe };
export type { BuildIdentity };
