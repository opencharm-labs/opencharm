import { describe, expect, it } from "vitest";

import { listWorkspaces, readRepoFile } from "./repo";

type PackageJson = { scripts?: Record<string, string> };

const REQUIRED_SCRIPTS = ["typecheck", "lint", "test"] as const;

describe("workspaces", () => {
  it("finds at least the checks workspace", () => {
    expect(listWorkspaces()).toContain("tools/checks");
  });

  it.each(listWorkspaces())(
    "%s has typecheck, lint and test scripts",
    (workspace) => {
      const pkg = JSON.parse(
        readRepoFile(workspace, "package.json")
      ) as PackageJson;
      for (const script of REQUIRED_SCRIPTS) {
        expect(
          pkg.scripts?.[script],
          `${workspace} is missing the "${script}" script`
        ).toBeTypeOf("string");
      }
    }
  );
});
