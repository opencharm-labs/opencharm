// Stages the charmd the desktop app carries (spec 013): Node, pinned in node.json and checked against
// its SHA-256, and the opencharm CLI built from this commit with its production dependencies for one
// target, into apps/desktop/charmd/ (the app's resources). Run after `npm run build -w packages/cli`
// and `npm run firmware:sim`.
// Usage: tsx scripts/stage-charmd.ts [--target aarch64-apple-darwin|x86_64-apple-darwin|x86_64-pc-windows-msvc]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

type Target = { node: string; os: string; cpu: string; windows: boolean };
type Pin = { version: string; archives: Record<string, string> };
type LockEntry = {
  version?: string;
  integrity?: string;
  optionalDependencies?: Record<string, string>;
};
type Lock = { packages: Record<string, LockEntry> };

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..");
const ROOT = join(APP, "..", "..");
const CLI = join(ROOT, "packages", "cli");
const OUT = join(APP, "charmd");
const CACHE = join(ROOT, "node_modules", ".cache", "opencharm-node");

const TARGETS: Record<string, Target> = {
  "aarch64-apple-darwin": {
    node: "darwin-arm64",
    os: "darwin",
    cpu: "arm64",
    windows: false,
  },
  "x86_64-apple-darwin": {
    node: "darwin-x64",
    os: "darwin",
    cpu: "x64",
    windows: false,
  },
  "x86_64-pc-windows-msvc": {
    node: "win-x64",
    os: "win32",
    cpu: "x64",
    windows: true,
  },
};

function hostTarget(): string {
  if (process.platform === "darwin")
    return process.arch === "arm64"
      ? "aarch64-apple-darwin"
      : "x86_64-apple-darwin";
  if (process.platform === "win32") return "x86_64-pc-windows-msvc";
  throw new Error(
    `The desktop app isn't built for ${process.platform} ${process.arch}`
  );
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

// The archive from nodejs.org, kept in a cache once its checksum matches the pin.
async function nodeArchive(pin: Pin, target: Target): Promise<string> {
  const name = `node-v${pin.version}-${target.node}.${target.windows ? "zip" : "tar.xz"}`;
  const expected = pin.archives[target.node];
  if (!expected)
    throw new Error(`node.json has no checksum for ${target.node}`);
  const file = join(CACHE, name);
  if (existsSync(file) && sha256(file) === expected) return file;
  mkdirSync(CACHE, { recursive: true });
  const response = await fetch(
    `https://nodejs.org/dist/v${pin.version}/${name}`
  );
  if (!response.ok)
    throw new Error(`Couldn't download ${name}: ${response.status}`);
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  const actual = sha256(file);
  if (actual !== expected) {
    rmSync(file, { force: true });
    throw new Error(
      `${name} doesn't match its pinned checksum (got ${actual}): not used`
    );
  }
  return file;
}

// Node's program, npm (npx runs ACP agents' adapters) and its licence; no headers or docs.
function stageNode(archive: string, target: Target, version: string): void {
  const unpacked = mkdtempSync(join(tmpdir(), "oc-node-"));
  try {
    // Windows' own tar reads .zip; in Git Bash (the release's shell) a GNU tar can come first on PATH.
    const tar =
      process.platform === "win32"
        ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
        : "tar";
    execFileSync(tar, ["-xf", archive, "-C", unpacked]);
    const root = join(unpacked, `node-v${version}-${target.node}`);
    const out = join(OUT, "node");
    if (target.windows) {
      for (const file of ["node.exe", "npm.cmd", "npx.cmd", "LICENSE"])
        cpSync(join(root, file), join(out, file));
      cpSync(
        join(root, "node_modules", "npm"),
        join(out, "node_modules", "npm"),
        { recursive: true }
      );
      return;
    }
    cpSync(join(root, "bin", "node"), join(out, "bin", "node"));
    cpSync(join(root, "LICENSE"), join(out, "LICENSE"));
    cpSync(
      join(root, "lib", "node_modules", "npm"),
      join(out, "lib", "node_modules", "npm"),
      { recursive: true }
    );
    // npm's own npx and npm are symlinks, which app bundles don't keep: small scripts instead.
    for (const tool of ["npx", "npm"]) {
      const script = join(out, "bin", tool);
      writeFileSync(
        script,
        `#!/bin/sh\nhere="$(cd "$(dirname "$0")" && pwd)"\nexec "$here/node" "$here/../lib/node_modules/npm/bin/${tool}-cli.js" "$@"\n`
      );
      chmodSync(script, 0o755);
    }
  } finally {
    rmSync(unpacked, { recursive: true, force: true });
  }
}

// The CLI as npm would ship it (dist/, sim/, its licence), with its dependencies exactly as the repo's
// lockfile has them, integrity hashes included: a lockfile for the staged folder is written from the
// root one (the CLI's dependencies and the voice engine's platform packages), and `npm ci` installs
// this target's. Nothing is resolved from version ranges at build time.
function stageCli(target: Target): void {
  for (const needed of [
    join(CLI, "dist", "main.mjs"),
    join(CLI, "sim", "charm_sim.wasm"),
  ])
    if (!existsSync(needed))
      throw new Error(
        `${needed} is missing: run npm run build -w packages/cli and npm run firmware:sim first`
      );
  const out = join(OUT, "cli");
  cpSync(join(CLI, "dist"), join(out, "dist"), { recursive: true });
  cpSync(join(CLI, "sim"), join(out, "sim"), { recursive: true });
  cpSync(join(ROOT, "LICENSE"), join(out, "LICENSE"));
  const pkg = JSON.parse(readFileSync(join(CLI, "package.json"), "utf8")) as {
    name: string;
    version: string;
    type: string;
    dependencies: Record<string, string>;
  };
  const root = JSON.parse(
    readFileSync(join(ROOT, "package-lock.json"), "utf8")
  ) as Lock;
  const entry = (name: string): LockEntry => {
    const found = root.packages[`node_modules/${name}`];
    if (!found?.version || !found.integrity)
      throw new Error(
        `${name} isn't locked (with an integrity hash) in package-lock.json`
      );
    return found;
  };
  const names = Object.keys(pkg.dependencies);
  // The packages the CLI's dependencies pull in: today only the voice engine's per-platform builds.
  const nested = names.flatMap((name) =>
    Object.keys(entry(name).optionalDependencies ?? {})
  );
  const dependencies = Object.fromEntries(
    names.map((name) => [name, entry(name).version!])
  );
  const manifest = {
    name: pkg.name,
    version: pkg.version,
    type: pkg.type,
    private: true,
    dependencies,
  };
  writeFileSync(
    join(out, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  const lockfile = {
    name: pkg.name,
    version: pkg.version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name: pkg.name, version: pkg.version, dependencies },
      ...Object.fromEntries(
        [...names, ...nested]
          .filter((name) => root.packages[`node_modules/${name}`])
          .map((name) => [`node_modules/${name}`, entry(name)])
      ),
    },
  };
  writeFileSync(
    join(out, "package-lock.json"),
    `${JSON.stringify(lockfile, null, 2)}\n`
  );
  execFileSync(
    "npm",
    [
      "ci",
      "--omit=dev",
      `--os=${target.os}`,
      `--cpu=${target.cpu}`,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      // Every version is pinned by the lockfile: a release-age wait on the build machine adds nothing.
      "--min-release-age=0",
    ],
    { cwd: out, stdio: "inherit", shell: process.platform === "win32" }
  );
  // Only this target's voice engine: another one means the install picked the build machine's.
  const engines = readdirSync(join(out, "node_modules")).filter(
    (name) => name.startsWith("sherpa-onnx-") && name !== "sherpa-onnx-node"
  );
  const wanted = `sherpa-onnx-${target.windows ? "win" : target.os}-${target.cpu}`;
  if (engines.length !== 1 || engines[0] !== wanted)
    throw new Error(
      `Expected only ${wanted} in the bundle, found: ${engines.join(", ") || "none"}`
    );
}

// Who wrote what the app carries: Node (its LICENSE is next to it) and each npm package, with the
// licence it declares; the package folders keep their own licence files where they ship one.
function writeNotices(version: string): void {
  const modules = join(OUT, "cli", "node_modules");
  const rows = readdirSync(modules)
    .filter((name) => !name.startsWith("."))
    .flatMap((name) =>
      name.startsWith("@")
        ? readdirSync(join(modules, name)).map((sub) => `${name}/${sub}`)
        : [name]
    )
    .map((name) => {
      const meta = JSON.parse(
        readFileSync(join(modules, name, "package.json"), "utf8")
      ) as {
        version: string;
        license?: string;
      };
      return `| ${name} | ${meta.version} | ${meta.license ?? "see its package"} |`;
    });
  writeFileSync(
    join(OUT, "THIRD_PARTY_NOTICES.md"),
    [
      "# What the desktop app's charmd carries",
      "",
      `- Node ${version}: MIT and the licences of its bundled code, in \`node/LICENSE\`.`,
      "- The OpenCharm CLI: MIT, in `cli/LICENSE`.",
      "",
      "| npm package | Version | Licence |",
      "| --- | --- | --- |",
      ...rows,
      "",
    ].join("\n")
  );
}

function size(path: string): number {
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.size;
  return readdirSync(path).reduce(
    (total, name) => total + size(join(path, name)),
    0
  );
}

const { values } = parseArgs({
  options: { target: { type: "string" } },
  strict: true,
});
const targetName = values.target ?? hostTarget();
const target = TARGETS[targetName];
if (!target)
  throw new Error(
    `Unknown target ${targetName}: ${Object.keys(TARGETS).join(", ")}`
  );
const pin = JSON.parse(readFileSync(join(APP, "node.json"), "utf8")) as Pin;

// The folder keeps only its placeholder in git; everything else is staged fresh.
for (const name of existsSync(OUT) ? readdirSync(OUT) : [])
  if (name !== ".gitkeep")
    rmSync(join(OUT, name), { recursive: true, force: true });
stageNode(await nodeArchive(pin, target), target, pin.version);
stageCli(target);
writeNotices(pin.version);
console.log(
  `Staged charmd for ${targetName}: Node ${pin.version}, ${Math.round(size(OUT) / 1e6)} MB in ${OUT}`
);
