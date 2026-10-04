import { execFileSync } from "node:child_process";

import { defineConfig } from "tsdown";

// The short commit, "-dirty" with uncommitted changes, "unknown" without git: the same rule as
// gitCommit in src/identity.ts (this config is loaded natively, before TypeScript sources resolve).
function gitCommit(): string {
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: import.meta.dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  try {
    const commit = git("rev-parse", "--short", "HEAD");
    return git("status", "--porcelain") ? `${commit}-dirty` : commit;
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
