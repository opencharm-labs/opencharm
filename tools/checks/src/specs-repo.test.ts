import { readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readRepoFile, repoPath } from "./repo";
import {
  SPEC_STATUSES,
  listSpecFolders,
  parseIndex,
  parseRetired,
  parseSpecHeader,
} from "./specs";

const names = readdirSync(repoPath("specs"));
const folders = listSpecFolders(names);
const index = parseIndex(readRepoFile("specs", "README.md"));
const statuses: readonly string[] = SPEC_STATUSES;

describe("specs folder", () => {
  it("has only numbered spec folders, _template and README.md", () => {
    const allowed = new Set([
      "_template",
      "README.md",
      ...folders.map((f) => f.name),
    ]);
    expect(names.filter((name) => !allowed.has(name))).toEqual([]);
  });

  it("gives every spec its own number, never a retired one", () => {
    const numbers = folders.map((f) => f.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    const retired = parseRetired(readRepoFile("specs", "README.md"));
    expect(numbers.filter((n) => retired.includes(n))).toEqual([]);
  });

  it.each(folders)(
    "$name has a matching header and a known status",
    (folder) => {
      const header = parseSpecHeader(
        readRepoFile("specs", folder.name, "spec.md")
      );
      expect(header.number, "the '# NNN: Title' line").toBe(folder.number);
      expect(header.title).toBeTruthy();
      expect(statuses, `status of ${folder.name}`).toContain(header.status);
    }
  );

  it("lists every spec in specs/README.md with the same status", () => {
    expect(
      index.map((row) => ({
        number: row.number,
        path: row.path,
        status: row.status,
      }))
    ).toEqual(
      folders.map((folder) => ({
        number: folder.number,
        path: `${folder.name}/spec.md`,
        status: parseSpecHeader(readRepoFile("specs", folder.name, "spec.md"))
          .status,
      }))
    );
  });
});
