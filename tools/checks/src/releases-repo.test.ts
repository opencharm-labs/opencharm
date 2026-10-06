import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readRepoFile, repoPath } from "./repo";

// The site's Download button opens /releases/latest, so the desktop app must be the only release
// GitHub marks Latest. GitHub marks a new release Latest unless told otherwise.
const WORKFLOWS = readdirSync(repoPath(".github", "workflows")).filter((f) =>
  f.endsWith(".yml")
);

describe("releases", () => {
  it.each(WORKFLOWS.filter((f) => f !== "desktop-release.yml"))(
    "%s never makes its release the Latest one (that's the desktop app's, for the Download link)",
    (file) => {
      // Whole commands: a line ending in "\\" continues on the next one.
      const creates = readRepoFile(".github", "workflows", file)
        .replace(/\\\n\s*/g, " ")
        .split("\n")
        .filter((line) => line.includes("gh release create"));
      for (const line of creates)
        expect(line, line.trim()).toContain("--latest=false");
    }
  );

  it("publishes each desktop release as the Latest one", () => {
    const workflow = readRepoFile(
      ".github",
      "workflows",
      "desktop-release.yml"
    );
    expect(workflow).toContain("prerelease=false");
    expect(workflow).toContain("make_latest=true");
  });
});
