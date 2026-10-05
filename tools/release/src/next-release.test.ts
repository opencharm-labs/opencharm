import { describe, expect, it } from "vitest";

import {
  type RawCommit,
  UNITS,
  latestVersion,
  nextVersion,
  parseCommit,
  planRelease,
  releaseNotes,
} from "./next-release";

const commit = (subject: string, body = "", sha = "a".repeat(40)) =>
  ({ sha, subject, body }) satisfies RawCommit;

describe("parseCommit", () => {
  it("reads a conventional commit title with its scope and pull request", () => {
    expect(
      parseCommit(commit("fix(charmd): keep the PIN pad up (#12)"))
    ).toMatchObject({
      type: "fix",
      scope: "charmd",
      breaking: false,
      description: "keep the PIN pad up (#12)",
    });
  });

  it("marks a breaking change only by the title's !, the pull request's own word", () => {
    expect(
      parseCommit(commit("feat(cli)!: drop the old config"))?.breaking
    ).toBe(true);
    // A squash body lists the branch's own commits; a footer in one of them doesn't make the PR breaking.
    expect(
      parseCommit(
        commit(
          "fix(cli): new flag",
          "* wip\n\nBREAKING CHANGE: renamed, then undone"
        )
      )?.breaking
    ).toBe(false);
  });

  it("reads GitHub's revert title as a revert", () => {
    expect(
      parseCommit(commit('Revert "feat(cli): a risky thing" (#30)'))
    ).toMatchObject({
      type: "revert",
      description: 'Revert "feat(cli): a risky thing" (#30)',
    });
  });

  it("ignores a title that isn't a conventional commit", () => {
    expect(
      parseCommit(commit("Merge pull request #1 from opencharm-labs/develop"))
    ).toBeUndefined();
  });
});

describe("nextVersion", () => {
  const parsed = (...subjects: string[]) =>
    subjects.map((s) => parseCommit(commit(s))).filter((c) => c !== undefined);

  it("releases nothing for docs, CI, tests and chores", () => {
    expect(
      nextVersion("0.1.0", parsed("docs: x", "ci: y", "chore: z", "test: w"))
    ).toBeUndefined();
  });

  it("bumps the patch for a fix, a performance change or a revert", () => {
    expect(nextVersion("0.1.0", parsed("fix: x"))).toBe("0.1.1");
    expect(nextVersion("0.1.0", parsed("perf: x"))).toBe("0.1.1");
    expect(nextVersion("0.1.0", parsed("revert: x"))).toBe("0.1.1");
  });

  it("bumps the minor for a feature, and for a breaking change while below 1.0", () => {
    expect(nextVersion("0.1.3", parsed("fix: x", "feat: y"))).toBe("0.2.0");
    expect(nextVersion("0.1.3", parsed("fix!: x"))).toBe("0.2.0");
  });

  it("releases nothing for a breaking change in docs, CI or a chore", () => {
    expect(
      nextVersion(
        "0.1.0",
        parsed("ci!: drop the old workflow", "docs!: rename a page")
      )
    ).toBeUndefined();
  });

  it("bumps the major for a breaking change from 1.0 on", () => {
    expect(nextVersion("1.4.2", parsed("feat!: x"))).toBe("2.0.0");
    expect(nextVersion("1.4.2", parsed("feat: x"))).toBe("1.5.0");
  });
});

describe("latestVersion", () => {
  it("takes the highest released version of the unit, by number", () => {
    const tags = [
      "cli@0.1.0",
      "cli@0.10.0",
      "cli@0.9.3",
      "desktop@2.0.0",
      "cli@banana",
      "cli@1.0.0-rc.1",
    ];
    expect(latestVersion(tags, "cli")).toBe("0.10.0");
  });

  it("has nothing to start from when the unit was never released", () => {
    expect(latestVersion(["desktop@0.1.0"], "cli")).toBeUndefined();
  });
});

describe("releaseNotes", () => {
  it("groups the changes and links the full comparison", () => {
    const commits = [
      commit("feat(desktop): a settings page (#20)", "", "b".repeat(40)),
      commit("fix: a crash (#21)", "", "c".repeat(40)),
      commit("docs: typo (#22)"),
    ]
      .map(parseCommit)
      .filter((c) => c !== undefined);
    const notes = releaseNotes(commits, {
      repo: "opencharm-labs/opencharm",
      unit: "desktop",
      previous: "0.1.0",
      version: "0.2.0",
    });
    expect(notes).toBe(
      [
        "### Features",
        "",
        "- **desktop:** a settings page (#20) (bbbbbbb)",
        "",
        "### Fixes",
        "",
        "- a crash (#21) (ccccccc)",
        "",
        "**Full changelog:** https://github.com/opencharm-labs/opencharm/compare/desktop@0.1.0...desktop@0.2.0",
        "",
      ].join("\n")
    );
  });
});

describe("release notes for a breaking change", () => {
  it("lists it once, under breaking changes", () => {
    const parsed = [parseCommit(commit("feat(cli)!: new config (#40)"))].filter(
      (c) => c !== undefined
    );
    const notes = releaseNotes(parsed, {
      repo: "o/r",
      unit: "cli",
      previous: "0.1.0",
      version: "0.2.0",
    });
    expect(notes.match(/new config/g)).toHaveLength(1);
    expect(notes).toContain("### Breaking changes");
  });
});

describe("reverts", () => {
  const plan = (subject: string) =>
    nextVersion(
      "0.2.0",
      [parseCommit(commit(subject))].filter((c) => c !== undefined)
    );

  it("release a patch when they undo something that was released", () => {
    expect(plan('Revert "feat(cli): a risky thing" (#30)')).toBe("0.2.1");
    expect(plan("revert: fix(charmd): the PIN change")).toBe("0.2.1");
  });

  it("release nothing when they undo docs, CI or a chore", () => {
    expect(plan('Revert "docs(cli): reword the README" (#40)')).toBeUndefined();
    expect(plan("revert: ci: the cache step")).toBeUndefined();
  });
});

describe("release notes for reverts", () => {
  it("leave out a revert of something that never released", () => {
    const parsed = [
      parseCommit(commit("fix: a crash (#50)")),
      parseCommit(commit('Revert "docs: reword the README" (#51)')),
    ].filter((c) => c !== undefined);
    const notes = releaseNotes(parsed, {
      repo: "o/r",
      unit: "cli",
      previous: "0.1.0",
      version: "0.1.1",
    });
    expect(notes).not.toContain("reword the README");
    expect(notes).toContain("a crash (#50)");
  });
});

describe("what each unit ships", () => {
  it("counts the website and the face engine it uses for the site (spec 015)", () => {
    expect(UNITS.web).toEqual(["apps/web", "packages/design"]);
  });

  it("counts only the firmware it ships: the core and the emulator, not the board port", () => {
    for (const unit of [UNITS.cli, UNITS.desktop]) {
      expect(unit).toContain("firmware/core");
      expect(unit).toContain("firmware/sim");
      expect(unit).not.toContain("firmware");
    }
  });

  it("counts the face engine for the desktop app, whose pages include it", () => {
    expect(UNITS.desktop).toContain("packages/design");
  });

  it("counts the charmd the desktop app carries (spec 013): the CLI, charmd, protocol and the lockfile its dependencies are pinned from", () => {
    for (const path of [
      "packages/cli",
      "packages/charmd",
      "packages/protocol",
      "package-lock.json",
    ])
      expect(UNITS.desktop).toContain(path);
  });

  it("doesn't count the lockfile: the CLI's dependencies are external, installed from their ranges", () => {
    expect(UNITS.cli).not.toContain("package-lock.json");
  });
});

describe("planRelease", () => {
  const git = (tags: string[], commits: RawCommit[]) => ({
    tags: () => tags,
    commitsSince: () => commits,
  });

  it("plans the next version, its tag and notes from the changes since the last tag", () => {
    const plan = planRelease(
      "cli",
      "opencharm-labs/opencharm",
      git(["cli@0.1.0"], [commit("fix(charmd): x (#9)")])
    );
    expect(plan).toMatchObject({
      previous: "0.1.0",
      version: "0.1.1",
      tag: "cli@0.1.1",
    });
    expect(plan.notes).toContain("- **charmd:** x (#9)");
  });

  it("plans no release when nothing user-facing changed", () => {
    expect(
      planRelease("cli", "o/r", git(["cli@0.1.0"], [commit("ci: x")])).version
    ).toBeUndefined();
  });

  it("refuses to guess a first version", () => {
    expect(() => planRelease("cli", "o/r", git([], []))).toThrow("cli@");
  });
});
