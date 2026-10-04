import { defineConfig } from "tsdown";

import { gitCommit } from "./src/identity.ts";

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
    __OPENCHARM_COMMIT__: JSON.stringify(gitCommit(import.meta.dirname)),
  },
});
