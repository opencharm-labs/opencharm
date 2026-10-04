import { execFileSync } from "node:child_process";

import { defineConfig } from "tsdown";

// OPENCHARM_COMMIT when CI sets it, else the short commit, "-dirty" with tracked changes, "unknown"
// without git: the same rule as
// gitCommit in src/identity.ts (this config is loaded natively, before TypeScript sources resolve).
function gitCommit(): string {
  if (process.env.OPENCHARM_COMMIT) return process.env.OPENCHARM_COMMIT;
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: import.meta.dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  try {
    const commit = git("rev-parse", "--short", "HEAD");
    return git("status", "--porcelain", "--untracked-files=no")
      ? `${commit}-dirty`
      : commit;
  } catch {
    return "unknown";
  }
}

// Internal @opencharm-labs packages are devDependencies, so tsdown inlines them and only `opencharm` is published.
export default defineConfig({
  entry: ["src/main.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  // Runtime dependencies stay real packages: opusscript loads its WebAssembly from its own folder,
  // which breaks once inlined, and ws/zod/the ACP SDK are shared with anything else the user installs.
  external: ["ws", "zod", "opusscript", "@agentclientprotocol/sdk"],
  // The commit this bundle is built from (spec 015), so `opencharm --version` says it without git.
  define: {
    __OPENCHARM_COMMIT__: JSON.stringify(gitCommit()),
  },
});
