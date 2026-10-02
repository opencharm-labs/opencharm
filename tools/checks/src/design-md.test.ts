import { describe, expect, it } from "vitest";

import { readRepoFile } from "./repo";
import { parseFrontmatter } from "./skills";

type Identity = { id: string; c: string; g: string; key: string };

// The order the DESIGN.md format (github.com/google-labs-code/design.md) requires.
const SECTIONS = [
  "Overview",
  "Colors",
  "Typography",
  "Layout",
  "Elevation & Depth",
  "Shapes",
  "Components",
  "Do's and Don'ts",
];

function designColours(): Record<string, unknown> {
  const parsed = parseFrontmatter(readRepoFile("DESIGN.md"));
  const colours = parsed?.data.colors;
  if (typeof colours !== "object" || colours === null) return {};
  return colours as Record<string, unknown>;
}

function expectedColours(): Record<string, string> {
  const tokens = JSON.parse(
    readRepoFile("packages", "design", "tokens.json")
  ) as { brand: { colours: Record<string, string> } };
  const faces = JSON.parse(
    readRepoFile("packages", "design", "faces.json")
  ) as {
    colours: Identity[];
  };
  const expected: Record<string, string> = { ...tokens.brand.colours };
  for (const { id, c, g, key } of faces.colours) {
    expected[`identity-${id}-shell`] = c;
    expected[`identity-${id}-glyph`] = g;
    expected[`identity-${id}-key`] = key;
  }
  return expected;
}

function upper(colours: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(colours).map(([name, value]) => [
      name,
      String(value).toUpperCase(),
    ])
  );
}

describe("DESIGN.md", () => {
  it("has exactly the brand and identity colours of tokens.json and faces.json (edit those, then mirror them here)", () => {
    expect(upper(designColours())).toEqual(upper(expectedColours()));
  });

  it("keeps the eight DESIGN.md sections in the format's order", () => {
    const headings = readRepoFile("DESIGN.md")
      .split("\n")
      .filter((line) => line.startsWith("## "))
      .map((line) => line.slice(3).trim());
    expect(headings).toEqual(SECTIONS);
  });
});
