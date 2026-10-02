// The guards every change must pass, whoever writes it (people or coding agents): no secrets, no
// personal paths, no AI tool credited as an author, no oversized files. The patterns are written so
// they never match their own source.

type Finding = { rule: string; match: string };

const SECRETS: ReadonlyArray<[string, RegExp]> = [
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["OpenAI or Anthropic key", /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}/],
  [
    "GitHub token",
    /\bgh[pousr]_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{40,}/,
  ],
  ["AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["npm token", /\bnpm_[A-Za-z0-9]{36}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
];
const ATTRIBUTION =
  /Co-Authored-By:[ \t]*[A-Za-z]|noreply@anthropic\.com|Generated with \[?Claude/i;

/** 1 MB: a bigger file is almost always a build output or a dataset that belongs elsewhere. */
const MAX_FILE_BYTES = 1024 * 1024;
// Big files kept on purpose: the symbol font the charm's heart comes from.
const BIG_ON_PURPOSE = new Set([
  "firmware/core/fonts/NotoSansSymbols2-Regular.ttf",
]);

function findSecrets(text: string): Finding[] {
  return SECRETS.flatMap(([rule, pattern]) => {
    const found = pattern.exec(text);
    // Only the start of a match: a report must not repeat the secret.
    return found ? [{ rule, match: `${found[0].slice(0, 8)}…` }] : [];
  });
}

function findAttribution(text: string): Finding[] {
  const found = ATTRIBUTION.exec(text);
  return found
    ? [{ rule: "AI tool credited as an author", match: found[0] }]
    : [];
}

function findHomePath(text: string, home: string): Finding[] {
  return home.length > 1 && text.includes(home)
    ? [{ rule: "this computer's home folder", match: home }]
    : [];
}

function isBinary(bytes: Buffer): boolean {
  return bytes.subarray(0, 8000).includes(0);
}

/** Every guard on one file about to be committed: what's wrong with it, for people to read. */
function checkFile(path: string, bytes: Buffer, home: string): string[] {
  const problems: string[] = [];
  if (bytes.length > MAX_FILE_BYTES && !BIG_ON_PURPOSE.has(path))
    problems.push(`${path}: over ${MAX_FILE_BYTES / 1024 / 1024} MB`);
  if (isBinary(bytes)) return problems;
  const text = bytes.toString("utf8");
  for (const f of [
    ...findSecrets(text),
    ...findHomePath(text, home),
    ...findAttribution(text),
  ])
    problems.push(`${path}: ${f.rule} (${f.match})`);
  return problems;
}

/** A commit message: no AI tool as an author, and no secret pasted into it. */
function checkMessage(text: string): string[] {
  return [...findAttribution(text), ...findSecrets(text)].map(
    (f) => `commit message: ${f.rule} (${f.match})`
  );
}

export {
  BIG_ON_PURPOSE,
  MAX_FILE_BYTES,
  checkFile,
  checkMessage,
  findAttribution,
  findHomePath,
  findSecrets,
  isBinary,
};
export type { Finding };
