// Decides a release from the conventional-commit titles merged to main since a unit's last tag
// (CONTRIBUTING "Releasing"): which version comes next, if any, and its release notes. Git tags are
// the only record of versions; the repository's package.json files say 0.0.0. Only titles count:
// pull requests are squash-merged, so the title is the pull request's own word on what it changes.

type Unit = "cli" | "desktop" | "web";

type RawCommit = { sha: string; subject: string; body: string };

type Commit = {
  sha: string;
  type: string;
  scope: string | undefined;
  breaking: boolean;
  description: string;
  // For a revert: the type of what it undoes, when the title says (a revert of docs releases nothing).
  reverts?: string | undefined;
};

type Git = {
  tags: () => string[];
  commitsSince: (tag: string, paths: readonly string[]) => RawCommit[];
};

type Plan = {
  unit: Unit;
  previous: string;
  version: string | undefined;
  tag: string | undefined;
  notes: string;
};

type Version = [number, number, number];

// What each unit ships, so only changes there count for it. The CLI bundles charmd, protocol, design
// and the emulator (firmware/core, firmware/sim; not a board port); its npm dependencies are external,
// installed from their ranges, so the lockfile never ships. The desktop app is its own code, the
// emulator, the app icon and the face engine its pages include (packages/design), and since spec 013
// the charmd it carries: the CLI, charmd and protocol, with dependencies pinned from the lockfile (and
// Node, pinned in apps/desktop/node.json). The website is apps/web and the face engine it shows.
const UNITS: Record<Unit, readonly string[]> = {
  cli: [
    "packages/cli",
    "packages/charmd",
    "packages/protocol",
    "packages/design",
    "firmware/core",
    "firmware/sim",
  ],
  desktop: [
    "apps/desktop",
    "firmware/core",
    "firmware/sim",
    "brand/icon",
    "packages/design",
    "packages/cli",
    "packages/charmd",
    "packages/protocol",
    "package-lock.json",
  ],
  web: ["apps/web", "packages/design"],
};

const SECTIONS: ReadonlyArray<[string, string]> = [
  ["feat", "Features"],
  ["fix", "Fixes"],
  ["perf", "Performance"],
  ["revert", "Reverts"],
];

const TITLE = /^(\w+)(?:\(([^)]*)\))?(!)?: (.+)$/;
// GitHub's Revert button titles the pull request this way.
const GITHUB_REVERT = /^Revert "(.+)"/;
const RELEASED = /^(\d+)\.(\d+)\.(\d+)$/;
const RELEASING = ["feat", "fix", "perf", "revert"];

function parse(version: string): Version | undefined {
  const match = RELEASED.exec(version);
  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : undefined;
}

function compare(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function typeOf(title: string): string | undefined {
  return TITLE.exec(title.trim())?.[1]?.toLowerCase();
}

// Only these change what people install: docs, CI, tests and chores never release, even when breaking,
// and neither does a revert of one of them.
function releases(c: Commit): boolean {
  if (c.type === "revert") return !c.reverts || RELEASING.includes(c.reverts);
  return ["feat", "fix", "perf"].includes(c.type);
}

function parseCommit(raw: RawCommit): Commit | undefined {
  const subject = raw.subject.trim();
  const revert = GITHUB_REVERT.exec(subject);
  if (revert)
    return {
      sha: raw.sha,
      type: "revert",
      scope: undefined,
      breaking: false,
      description: subject,
      reverts: typeOf(revert[1] ?? ""),
    };
  const match = TITLE.exec(subject);
  if (!match?.[1] || !match[4]) return undefined;
  const type = match[1].toLowerCase();
  return {
    sha: raw.sha,
    type,
    scope: match[2] || undefined,
    breaking: match[3] === "!",
    description: match[4],
    reverts: type === "revert" ? typeOf(match[4]) : undefined,
  };
}

// Semver, with the usual rule below 1.0: a breaking change bumps the minor, not the major.
function nextVersion(
  current: string,
  commits: readonly Commit[]
): string | undefined {
  const version = parse(current);
  if (!version) throw new Error(`Not a released version: ${current}`);
  const [major, minor, patch] = version;
  const releasing = commits.filter(releases);
  const breaking = releasing.some((c) => c.breaking);
  const feature = releasing.some((c) => c.type === "feat");
  if (breaking && major > 0) return `${major + 1}.0.0`;
  if (breaking || feature) return `${major}.${minor + 1}.0`;
  if (releasing.length > 0) return `${major}.${minor}.${patch + 1}`;
  return undefined;
}

function latestVersion(
  tags: readonly string[],
  unit: Unit
): string | undefined {
  const versions = tags
    .filter((tag) => tag.startsWith(`${unit}@`))
    .map((tag) => tag.slice(unit.length + 1))
    .filter((version) => parse(version) !== undefined);
  return versions.sort((a, b) => compare(parse(b)!, parse(a)!))[0];
}

function releaseNotes(
  all: readonly Commit[],
  release: { repo: string; unit: Unit; previous: string; version: string }
): string {
  const commits = all.filter(releases);
  const breaking = commits.filter((c) => c.breaking);
  const groups: Array<[string, readonly Commit[]]> = [
    ["Breaking changes", breaking],
    ...SECTIONS.map(([type, title]): [string, Commit[]] => [
      title,
      commits.filter((c) => c.type === type && !c.breaking),
    ]),
  ];
  const lines: string[] = [];
  for (const [title, list] of groups) {
    if (list.length === 0) continue;
    lines.push(`### ${title}`, "");
    for (const c of list)
      lines.push(
        `- ${c.scope ? `**${c.scope}:** ` : ""}${c.description} (${c.sha.slice(0, 7)})`
      );
    lines.push("");
  }
  const { repo, unit, previous, version } = release;
  lines.push(
    `**Full changelog:** https://github.com/${repo}/compare/${unit}@${previous}...${unit}@${version}`,
    ""
  );
  return lines.join("\n");
}

function planRelease(unit: Unit, repo: string, git: Git): Plan {
  const previous = latestVersion(git.tags(), unit);
  if (!previous)
    throw new Error(
      `No ${unit}@<version> tag to start from: tag the first release by hand`
    );
  const commits = git
    .commitsSince(`${unit}@${previous}`, UNITS[unit])
    .map(parseCommit)
    .filter((c) => c !== undefined);
  const version = nextVersion(previous, commits);
  return {
    unit,
    previous,
    version,
    tag: version ? `${unit}@${version}` : undefined,
    notes: version
      ? releaseNotes(commits, { repo, unit, previous, version })
      : "",
  };
}

export {
  UNITS,
  latestVersion,
  nextVersion,
  parseCommit,
  planRelease,
  releaseNotes,
};
export type { Commit, Git, Plan, RawCommit, Unit };
