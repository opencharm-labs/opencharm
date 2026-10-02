// Copies the built emulator (Emscripten output + web page) into the CLI package, which serves it
// with `opencharm sim`. Run through: npm run firmware:sim.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = join(HERE, "build");
const OUT = join(HERE, "..", "..", "packages", "cli", "sim");

for (const file of ["charm_sim.js", "charm_sim.wasm"]) {
  if (!existsSync(join(BUILD, file))) {
    console.error(`Missing ${file}: the Emscripten build did not run.`);
    process.exit(1);
  }
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(HERE, "web"), OUT, { recursive: true });
for (const file of ["charm_sim.js", "charm_sim.wasm"])
  cpSync(join(BUILD, file), join(OUT, file));
// The libraries inside the WebAssembly ask for their notices to ship with it (npm, desktop app).
cpSync(
  join(HERE, "THIRD_PARTY_NOTICES.md"),
  join(OUT, "THIRD_PARTY_NOTICES.md")
);
console.log("wrote packages/cli/sim/ (serve it with: opencharm sim)");
