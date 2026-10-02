import { describe, expect, it } from "vitest";

import {
  appendIndexRow,
  formatSpecNumber,
  isValidSlug,
  listSpecFolders,
  nextSpecNumber,
  parseIndex,
  parseRetired,
  parseSpecHeader,
  titleFromSlug,
} from "./specs";

describe("listSpecFolders", () => {
  it("keeps numbered folders in order and ignores the rest", () => {
    expect(
      listSpecFolders(["002-b", "_template", "README.md", "001-a", "1-bad"])
    ).toEqual([
      { number: 1, slug: "a", name: "001-a" },
      { number: 2, slug: "b", name: "002-b" },
    ]);
  });
});

describe("parseSpecHeader", () => {
  it("reads number, title and status", () => {
    expect(
      parseSpecHeader("# 004: charmd core\n\nStatus: In progress\n")
    ).toEqual({ number: 4, title: "charmd core", status: "In progress" });
  });

  it("returns nulls when the header is missing", () => {
    expect(parseSpecHeader("no header")).toEqual({
      number: null,
      title: null,
      status: null,
    });
  });
});

describe("parseIndex", () => {
  it("reads rows of the specs index table", () => {
    expect(
      parseIndex(
        "| # | Spec | Status |\n|---|---|---|\n| 001 | [Repo foundation](001-repo-foundation/spec.md) | Approved |\n"
      )
    ).toEqual([
      {
        number: 1,
        title: "Repo foundation",
        path: "001-repo-foundation/spec.md",
        status: "Approved",
      },
    ]);
  });
});

describe("parseIndex with Prettier-aligned tables", () => {
  it("reads rows whose cells are padded with spaces", () => {
    expect(
      parseIndex(
        "| #   | Spec                          | Status |\n| --- | ----------------------------- | ------ |\n| 001 | [A](001-a/spec.md)            | Done   |\n"
      )
    ).toEqual([
      { number: 1, title: "A", path: "001-a/spec.md", status: "Done" },
    ]);
  });

  it("appends after a padded last row", () => {
    expect(
      appendIndexRow("| 001 | [A](001-a/spec.md)   | Done   |\n", {
        number: "002",
        name: "002-b",
        title: "B",
      })
    ).toBe(
      "| 001 | [A](001-a/spec.md)   | Done   |\n| 002 | [B](002-b/spec.md) | Draft |\n"
    );
  });
});

describe("parseRetired", () => {
  it("reads the retired numbers from the index", () => {
    expect(parseRetired("Intro.\n\nRetired numbers: 001, 003, 021.\n")).toEqual(
      [1, 3, 21]
    );
    expect(parseRetired("No such line.")).toEqual([]);
  });
});

describe("nextSpecNumber", () => {
  it("never reuses a retired number", () => {
    expect(
      nextSpecNumber([{ number: 20, slug: "t", name: "020-t" }], [1, 3, 21])
    ).toBe(22);
  });

  it("continues after the highest number, even after a dropped spec", () => {
    expect(
      nextSpecNumber([
        { number: 1, slug: "a", name: "001-a" },
        { number: 3, slug: "c", name: "003-c" },
      ])
    ).toBe(4);
  });

  it("starts at 1 in an empty folder", () => {
    expect(nextSpecNumber([])).toBe(1);
  });
});

describe("slugs and titles", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    expect(isValidSlug("charmd-core")).toBe(true);
  });

  it.each([
    "Charmd-Core",
    "charmd core",
    "charmd_core",
    "-x",
    "x-",
    "a--b",
    "",
  ])("rejects %j", (slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });

  it("turns a slug into a sentence-case title", () => {
    expect(titleFromSlug("charmd-voice-agent")).toBe("Charmd voice agent");
  });

  it("pads numbers to three digits", () => {
    expect(formatSpecNumber(7)).toBe("007");
  });
});

describe("appendIndexRow", () => {
  it("adds a Draft row after the last row of the table", () => {
    const before =
      "## Index\n\n| # | Spec | Status |\n|---|---|---|\n| 001 | [A](001-a/spec.md) | Done |\n\nAfter.\n";
    expect(
      appendIndexRow(before, { number: "002", name: "002-b", title: "B" })
    ).toBe(
      "## Index\n\n| # | Spec | Status |\n|---|---|---|\n| 001 | [A](001-a/spec.md) | Done |\n| 002 | [B](002-b/spec.md) | Draft |\n\nAfter.\n"
    );
  });
});
