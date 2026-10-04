import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MODELS, installModel, modelState, type ModelSpec } from "./models";

let root: string;
let server: Server;
let archive: Buffer;
let base: string;
let hits = 0;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "oc-models-"));
  const src = join(root, "src");
  mkdirSync(join(src, "tiny-model"), { recursive: true });
  writeFileSync(join(src, "tiny-model", "model.onnx"), "weights");
  writeFileSync(join(src, "tiny-model", "tokens.txt"), "a b c");
  execFileSync("tar", [
    "-cjf",
    join(root, "tiny.tar.bz2"),
    "-C",
    src,
    "tiny-model",
  ]);
  archive = readFileSync(join(root, "tiny.tar.bz2"));
  server = createServer((req, res) => {
    hits += 1;
    if (req.url === "/tiny.tar.bz2")
      res.writeHead(200, { "content-length": archive.length }).end(archive);
    else res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

function spec(overrides: Partial<ModelSpec> = {}): ModelSpec {
  return {
    label: "Tiny",
    url: `${base}/tiny.tar.bz2`,
    sha256: createHash("sha256").update(archive).digest("hex"),
    bytes: archive.length,
    folder: "tiny-model",
    files: ["model.onnx", "tokens.txt"],
    ...overrides,
  };
}

describe("model downloads", () => {
  it("pins every shipped model to an https URL and a SHA-256", () => {
    for (const model of Object.values(MODELS)) {
      expect(model.url).toMatch(
        /^https:\/\/github\.com\/k2-fsa\/sherpa-onnx\/releases\/download\//
      );
      expect(model.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(model.bytes).toBeGreaterThan(1_000_000);
    }
  });

  it("downloads, checks and unpacks a model once, reporting progress", async () => {
    const dir = join(root, "ok");
    const progress: number[] = [];
    const path = await installModel("parakeet", {
      dir,
      spec: spec(),
      onProgress: (received) => progress.push(received),
    });
    expect(path).toBe(join(dir, "tiny-model"));
    expect(readFileSync(join(path, "model.onnx"), "utf8")).toBe("weights");
    expect(progress.at(-1)).toBe(archive.length);
    // Nothing left behind but the model.
    expect(readdirSync(dir)).toEqual(["tiny-model"]);
    const before = hits;
    await installModel("parakeet", { dir, spec: spec() });
    expect(hits).toBe(before);
  });

  it("shares one download between callers that ask at the same time", async () => {
    const dir = join(root, "shared");
    const before = hits;
    const [a, b] = await Promise.all([
      installModel("parakeet", { dir, spec: spec() }),
      installModel("parakeet", { dir, spec: spec() }),
    ]);
    expect(a).toBe(b);
    expect(hits - before).toBe(1);
  });

  it("throws away an archive that doesn't match its checksum and leaves no model", async () => {
    const dir = join(root, "bad");
    await expect(
      installModel("parakeet", { dir, spec: spec({ sha256: "0".repeat(64) }) })
    ).rejects.toThrow(/checksum/);
    expect(readdirSync(dir)).toEqual([]);
    expect(modelState("parakeet", dir)).toMatchObject({ state: "failed" });
  });

  it("fails clearly when the download isn't there", async () => {
    const dir = join(root, "missing");
    await expect(
      installModel("parakeet", { dir, spec: spec({ url: `${base}/nope` }) })
    ).rejects.toThrow(/Couldn't download Tiny: 404/);
  });
});
