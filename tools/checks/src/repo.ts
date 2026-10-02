import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Every check resolves paths from this file, never from process.cwd(), so they pass from any folder.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
// Gitignored folders (dependencies, build output, local tool state) are not part of the repo's rules.
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  ".venv",
  ".ruff_cache",
  ".superpowers",
  "build",
  "target",
]);

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function repoPath(...parts: string[]): string {
  return join(ROOT, ...parts);
}

function readRepoFile(...parts: string[]): string {
  return readFileSync(repoPath(...parts), "utf8");
}

function walkRepo(dir: string = ROOT): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    found.push(toPosix(relative(ROOT, full)));
    // Symlinks are listed but not followed: .claude/skills points back into the repo.
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      found.push(...walkRepo(full));
    }
  }
  return found;
}

// What Git would commit: tracked files plus new ones that aren't ignored. The guards check exactly
// this, so a build output or a local secret that .gitignore keeps out never trips them.
function committableFiles(): string[] {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  )
    .split("\0")
    .filter((path) => path && existsSync(repoPath(path)));
}

function listWorkspaces(): string[] {
  const pkg = JSON.parse(readRepoFile("package.json")) as {
    workspaces: string[];
  };
  return pkg.workspaces.flatMap((pattern) => {
    const base = pattern.replace(/\/\*$/, "");
    if (!existsSync(repoPath(base))) return [];
    return readdirSync(repoPath(base), { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(repoPath(base, entry.name, "package.json"))
      )
      .map((entry) => `${base}/${entry.name}`);
  });
}

export { committableFiles, listWorkspaces, readRepoFile, repoPath, walkRepo };
