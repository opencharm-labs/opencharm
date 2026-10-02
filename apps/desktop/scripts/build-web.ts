// Assembles the desktop app's web files: the built emulator (firmware core in WebAssembly, from
// `npm run firmware:sim`) plus the desktop page. Run before `tauri dev` or `tauri build`.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SIM = join(HERE, "..", "..", "..", "packages", "cli", "sim");
const OUT = join(HERE, "..", "dist");
const LICENCE_FILE = /^(?:licen[cs]e|copying|notice)/i;

type CargoPackage = {
  name: string;
  version: string;
  license: string | null;
  source: string | null;
  manifest_path: string;
  id: string;
};

// The app's binary contains the Rust crates it's built for (this platform); their licences (mostly
// MIT and Apache-2.0) ask for their notices to come with it. Each distinct text appears once, with
// the crates that carry it.
function rustLicences(): string {
  const host = /host: (\S+)/.exec(
    execFileSync("rustc", ["-vV"], { encoding: "utf8" })
  )?.[1];
  const metadata = JSON.parse(
    execFileSync(
      "cargo",
      [
        "metadata",
        "--format-version",
        "1",
        "--locked",
        ...(host ? ["--filter-platform", host] : []),
        "--manifest-path",
        join(HERE, "..", "src-tauri", "Cargo.toml"),
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    )
  ) as { packages: CargoPackage[]; resolve: { nodes: Array<{ id: string }> } };
  const used = new Set(metadata.resolve.nodes.map((n) => n.id));
  const crates = metadata.packages
    .filter((p) => p.source !== null && used.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const texts = new Map<string, string[]>();
  const list: string[] = [];
  for (const crate of crates) {
    const name = `${crate.name} ${crate.version}`;
    list.push(`- ${name}: ${crate.license ?? "see its licence file"}`);
    const dir = dirname(crate.manifest_path);
    for (const file of readdirSync(dir).filter((f) => LICENCE_FILE.test(f))) {
      const text = readFileSync(join(dir, file), "utf8").trim();
      texts.set(text, [...(texts.get(text) ?? []), name]);
    }
  }
  const parts = [
    "Third-party Rust crates in the OpenCharm desktop app, and their licence texts.",
    "",
    ...list,
  ];
  for (const [text, names] of texts)
    parts.push("", `==== ${names.join(", ")}`, "", text);
  return parts.join("\n");
}

if (!existsSync(join(SIM, "charm_sim.wasm"))) {
  console.error("No built emulator: run `npm run firmware:sim` first.");
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(SIM, OUT, { recursive: true });
cpSync(join(HERE, "..", "web"), OUT, { recursive: true });
// The face engine (the source of truth for faces) draws the live charm in the settings window.
cpSync(
  join(HERE, "..", "..", "..", "packages", "design", "src", "charm-face.js"),
  join(OUT, "charm-face.js")
);
writeFileSync(join(OUT, "THIRD_PARTY_RUST_LICENSES.txt"), rustLicences());
console.log(`wrote ${OUT}`);
