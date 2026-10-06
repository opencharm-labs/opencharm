// What this deploy of the site is (spec 015): `web@<version> (<commit>)`, from the latest web@ tag.
// A deploy that isn't a release counts the commits since it: `web@0.3.1+2 (abc1234)`. Computed once
// at build time (next.config.ts); Vercel deploys each merge before CI tags it, so a release's own
// deploy shows the previous version until the next one (maintainer, 4 October 2026).
import { execFileSync } from "node:child_process";

import { z } from "zod";

type BuildIdentity = { version: string; commit: string; text: string };
type Unit = "desktop" | "cli";
type Releases = z.infer<typeof RELEASES>;

const DESCRIBE = /^(web@\d+\.\d+\.\d+)(?:-(\d+)-g[0-9a-f]+)?$/;
const RELEASE = /^(\w+)@(\d+)\.(\d+)\.(\d+)$/;
// The newest desktop app and CLI releases, for the title block: the code says 0.0.0, the tags don't.
// Handed from next.config.ts to the page in this variable, checked on the way in.
const RELEASES_ENV = "OPENCHARM_RELEASES";
const RELEASES = z.object({
  desktop: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .optional(),
  cli: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .optional(),
});

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

// Same rule as tools/release's latestVersion: only plain x.y.z versions count.
function newestRelease(
  tags: readonly string[],
  unit: Unit
): string | undefined {
  const versions = tags.flatMap((tag) => {
    const m = RELEASE.exec(tag);
    return m?.[1] === unit
      ? [[Number(m[2]), Number(m[3]), Number(m[4])] as const]
      : [];
  });
  versions.sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]);
  return versions[0]?.join(".");
}

// Vercel clones without tags (and shallow), so on CI or Vercel only, fetch them, once per build;
// never on a contributor's machine.
function ensureTags(): void {
  if (!(process.env.VERCEL || process.env.CI) || process.env.OPENCHARM_TAGS)
    return;
  if (git("fetch", "--quiet", "--tags", "--unshallow") === undefined)
    git("fetch", "--quiet", "--tags");
  process.env.OPENCHARM_TAGS = "fetched";
}

// What next.config.ts found, for the page; undefined before it has run.
function builtReleases(): Releases | undefined {
  const raw = process.env[RELEASES_ENV];
  return raw ? RELEASES.parse(JSON.parse(raw)) : undefined;
}

function releases(): Releases {
  const known = builtReleases();
  if (known) return known;
  ensureTags();
  const tags = (git("tag", "--list") ?? "").split("\n");
  const found = {
    desktop: newestRelease(tags, "desktop"),
    cli: newestRelease(tags, "cli"),
  };
  for (const unit of ["desktop", "cli"] as const)
    if (!found[unit])
      console.warn(
        `No ${unit}@ release tag found: the header shows ${unit} without a version.`
      );
  process.env[RELEASES_ENV] = JSON.stringify(found);
  return found;
}

// OPENCHARM_COMMIT when CI sets it, else git (Vercel's commit variable without it); the tags are
// fetched where the clone has none (ensureTags). "-dirty" means tracked changes, as everywhere.
function buildIdentity(): BuildIdentity {
  // Next evaluates its config in several processes; the first computes, the rest inherit it.
  const known = process.env.OPENCHARM_WEB_IDENTITY;
  if (known) return JSON.parse(known) as BuildIdentity;
  const fromCi = process.env.OPENCHARM_COMMIT || undefined;
  const commit =
    fromCi ??
    git("rev-parse", "--short", "HEAD") ??
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
    "unknown";
  const describe = () => git("describe", "--tags", "--match", "web@*");
  let found = describe();
  if (!found) {
    ensureTags();
    found = describe();
  }
  const dirty =
    !fromCi &&
    (git("status", "--porcelain", "--untracked-files=no") ?? "").length > 0;
  const identity = fromDescribe(found, commit, dirty);
  process.env.OPENCHARM_WEB_IDENTITY = JSON.stringify(identity);
  return identity;
}

export { builtReleases, buildIdentity, fromDescribe, newestRelease, releases };
export type { BuildIdentity, Releases };
