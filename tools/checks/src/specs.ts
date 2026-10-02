const SPEC_STATUSES = [
  "Draft",
  "Approved",
  "In progress",
  "Done",
  "Dropped",
] as const;

type SpecStatus = (typeof SPEC_STATUSES)[number];
type SpecFolder = { number: number; slug: string; name: string };
type IndexRow = { number: number; title: string; path: string; status: string };
type SpecHeader = {
  number: number | null;
  title: string | null;
  status: string | null;
};

const FOLDER = /^(\d{3})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TITLE_LINE = /^# (\d{3}): (.+)$/m;
const STATUS_LINE = /^Status: (.+)$/m;
// Prettier pads table cells to align columns, so every separator tolerates extra spaces.
const INDEX_ROW =
  /^\|\s*(\d{3})\s*\|\s*\[(.+?)\]\((.+?)\)\s*\|\s*(.+?)\s*\|$/gm;
const INDEX_ROW_START = /^\|\s*\d{3}\s*\|/;

function listSpecFolders(names: readonly string[]): SpecFolder[] {
  return names
    .flatMap((name) => {
      const match = FOLDER.exec(name);
      return match?.[1] && match[2]
        ? [{ number: Number(match[1]), slug: match[2], name }]
        : [];
    })
    .sort((a, b) => a.number - b.number);
}

function parseSpecHeader(text: string): SpecHeader {
  const title = TITLE_LINE.exec(text);
  const status = STATUS_LINE.exec(text);
  return {
    number: title?.[1] ? Number(title[1]) : null,
    title: title?.[2]?.trim() ?? null,
    status: status?.[1]?.trim() ?? null,
  };
}

function parseIndex(markdown: string): IndexRow[] {
  return [...markdown.matchAll(INDEX_ROW)].map((match) => ({
    number: Number(match[1]),
    title: match[2] ?? "",
    path: match[3] ?? "",
    status: (match[4] ?? "").trim(),
  }));
}

// Numbers only grow: a dropped spec keeps its number so links in PRs and issues never change meaning.
// Numbers of removed documents that weren't features (specs/README.md, "Retired numbers: 001, …").
// A number is never given twice, so an old reference can't point at a different spec.
function parseRetired(indexText: string): number[] {
  const line = /^Retired numbers: (.+)$/m.exec(indexText)?.[1] ?? "";
  return [...line.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

function nextSpecNumber(
  folders: readonly SpecFolder[],
  retired: readonly number[] = []
): number {
  const used = [...folders.map((folder) => folder.number), ...retired];
  return used.reduce((max, n) => Math.max(max, n), 0) + 1;
}

function formatSpecNumber(n: number): string {
  return String(n).padStart(3, "0");
}

function isValidSlug(slug: string): boolean {
  return SLUG.test(slug);
}

function titleFromSlug(slug: string): string {
  const words = slug.split("-").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function appendIndexRow(
  markdown: string,
  row: { number: string; name: string; title: string }
): string {
  const lines = markdown.split("\n");
  const lastRow = lines.reduce(
    (last, line, i) => (INDEX_ROW_START.test(line) ? i : last),
    -1
  );
  if (lastRow < 0) throw new Error("specs/README.md has no index rows");
  lines.splice(
    lastRow + 1,
    0,
    `| ${row.number} | [${row.title}](${row.name}/spec.md) | Draft |`
  );
  return lines.join("\n");
}

export {
  SPEC_STATUSES,
  appendIndexRow,
  formatSpecNumber,
  isValidSlug,
  listSpecFolders,
  nextSpecNumber,
  parseRetired,
  parseIndex,
  parseSpecHeader,
  titleFromSlug,
};
export type { IndexRow, SpecFolder, SpecHeader, SpecStatus };
