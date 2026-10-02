import { existsSync, readdirSync, realpathSync } from "node:fs";
import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

import { listWorkspaces, readRepoFile, repoPath, walkRepo } from "./repo";
import { validateSkill } from "./skills";

const MAX_AGENTS_LINES = 150;
const files = walkRepo();
const claudeFiles = files.filter((path) => path.endsWith("CLAUDE.md"));
const agentsFiles = files.filter((path) => path.endsWith("AGENTS.md"));
const skillFolders = existsSync(repoPath(".agents", "skills"))
  ? readdirSync(repoPath(".agents", "skills"))
  : [];

describe("agent instructions", () => {
  it(`keeps AGENTS.md at ${MAX_AGENTS_LINES} lines or fewer (every agent loads it every session)`, () => {
    expect(readRepoFile("AGENTS.md").split("\n").length).toBeLessThanOrEqual(
      MAX_AGENTS_LINES
    );
  });

  it.each(listWorkspaces())("AGENTS.md names the workspace %s", (workspace) => {
    expect(readRepoFile("AGENTS.md")).toContain(workspace);
  });

  it.each(claudeFiles)("%s imports its AGENTS.md on the first line", (path) => {
    expect(readRepoFile(path).split("\n")[0]).toBe("@AGENTS.md");
    const sibling =
      dirname(path) === "." ? "AGENTS.md" : `${dirname(path)}/AGENTS.md`;
    expect(existsSync(repoPath(sibling)), `${sibling} exists`).toBe(true);
  });

  it.each(agentsFiles.filter((path) => path !== "AGENTS.md"))(
    "%s has a CLAUDE.md next to it",
    (path) => {
      expect(existsSync(repoPath(dirname(path), "CLAUDE.md"))).toBe(true);
    }
  );
});

describe("skills", () => {
  it("has at least one skill", () => {
    expect(skillFolders.length).toBeGreaterThan(0);
  });

  it.each(skillFolders)(
    ".agents/skills/%s is a valid Agent Skill",
    (folder) => {
      expect(
        validateSkill(
          folder,
          readRepoFile(".agents", "skills", folder, "SKILL.md")
        )
      ).toEqual([]);
    }
  );

  it(".claude/skills points at .agents/skills (on Windows: git config core.symlinks true, then re-clone)", () => {
    expect(realpathSync(repoPath(".claude", "skills"))).toBe(
      realpathSync(repoPath(".agents", "skills"))
    );
  });
});
