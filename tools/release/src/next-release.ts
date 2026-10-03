// Decides a release from the conventional-commit titles merged to main since a unit's last tag
// (CONTRIBUTING "Releasing"): which version comes next, if any, and its release notes. Git tags are
// the only record of versions; the repository's package.json files say 0.0.0.

type Unit = "cli" | "desktop";

type RawCommit = { sha: string; subject: string; body: string };

type Commit = {
  sha: string;
  type: string;
  scope: string | undefined;
  breaking: boolean;
  description: string;
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
// and the emulator (firmware); the desktop app is its own code, the emulator and the app icon.
const UNITS: Record<Unit, readonly string[]> = {
  cli: [
    "packages/cli",
    "packages/charmd",
    "packages/protocol",
    "packages/design",
    "firmware",
  ],
  desktop: ["apps/desktop", "firmware", "brand/icon"],
};

const SECTIONS: ReadonlyArray<[string, string]> = [
  ["feat", "Features"],
  ["fix", "Fixes"],
  ["perf", "Performance"],
  ["revert", "Reverts"],
];

const TITLE = /^(\w+)(?:\(([^)]*)\))?(!)?: (.+)$/;
const RELEASED = /^(\d+)\.(\d+)\.(\d+)$/;

function parse(version: string): Version | undefined {
  const match = RELEASED.exec(version);
  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : undefined;
}

function compare(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function parseCommit(raw: RawCommit): Commit | undefined {
  const match = TITLE.exec(raw.subject.trim());
  if (!match?.[1] || !match[4]) return undefined;
  return {
    sha: raw.sha,
    type: match[1].toLowerCase(),
    scope: match[2] || undefined,
    breaking: match[3] === "!" || /^BREAKING[ -]CHANGE:/m.test(raw.body),
    description: match[4],
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
  const breaking = commits.some((c) => c.breaking);
  const feature = commits.some((c) => c.type === "feat");
  const fix = commits.some((c) => ["fix", "perf", "revert"].includes(c.type));
  if (breaking && major > 0) return `${major + 1}.0.0`;
  if (breaking || feature) return `${major}.${minor + 1}.0`;
  if (fix) return `${major}.${minor}.${patch + 1}`;
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
  commits: readonly Commit[],
  release: { repo: string; unit: Unit; previous: string; version: string }
): string {
  const lines: string[] = [];
  const breaking = commits.filter((c) => c.breaking);
  const groups: Array<[string, readonly Commit[]]> = [
    ...(breaking.length
      ? [["Breaking changes", breaking] as [string, Commit[]]]
      : []),
    ...SECTIONS.map(([type, title]): [string, Commit[]] => [
      title,
      commits.filter((c) => c.type === type),
    ]),
  ];
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
