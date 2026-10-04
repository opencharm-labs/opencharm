// The local voice's models (spec 003): downloaded on first use, never shipped in the npm package.
// Each archive is pinned by URL, size and SHA-256; a file that doesn't match is thrown away, and a
// model only appears in the models folder once it's complete (extracted aside, then renamed in).
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

type ModelId = "parakeet" | "supertonic";
type ModelSpec = {
  label: string;
  url: string;
  sha256: string;
  bytes: number;
  // The folder inside the archive, kept as the model's folder name.
  folder: string;
  // Present once the model is installed.
  files: string[];
};
type ModelState =
  | { state: "missing" }
  | { state: "downloading"; received: number; total: number }
  | { state: "ready" }
  | { state: "failed"; error: string };
type InstallOptions = {
  dir?: string;
  onProgress?: (received: number, total: number) => void;
  signal?: AbortSignal;
  // Tests point at a local server and a small archive.
  spec?: ModelSpec;
};

const RELEASES = "https://github.com/k2-fsa/sherpa-onnx/releases/download";

const MODELS: Record<ModelId, ModelSpec> = {
  // NVIDIA Parakeet TDT 0.6B v3, int8 (CC-BY-4.0), as exported for sherpa-onnx.
  parakeet: {
    label: "Parakeet (listening)",
    url: `${RELEASES}/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2`,
    sha256: "5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf",
    bytes: 487170055,
    folder: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
    files: [
      "encoder.int8.onnx",
      "decoder.int8.onnx",
      "joiner.int8.onnx",
      "tokens.txt",
    ],
  },
  // Supertone's Supertonic 3, int8, as exported for sherpa-onnx.
  supertonic: {
    label: "Supertonic (speaking)",
    url: `${RELEASES}/tts-models/sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2`,
    sha256: "82fa96f91c4ef8abaae3a14a3f4153facf88bed821d1f7331cec2700f432c427",
    bytes: 128774318,
    folder: "sherpa-onnx-supertonic-3-tts-int8-2026-05-11",
    files: [
      "duration_predictor.int8.onnx",
      "text_encoder.int8.onnx",
      "vector_estimator.int8.onnx",
      "vocoder.int8.onnx",
      "tts.json",
      "unicode_indexer.bin",
      "voice.bin",
    ],
  },
};

// A model isn't on this computer yet: it's downloading, and the turn says so instead of failing silently.
class VoiceNotReady extends Error {}

const states = new Map<string, ModelState>();
const installing = new Map<string, Promise<string>>();

function defaultModelsDir(): string {
  return join(homedir(), ".opencharm", "models");
}

function modelPath(id: ModelId, dir = defaultModelsDir()): string {
  return join(dir, MODELS[id].folder);
}

function isInstalled(spec: ModelSpec, dir: string): boolean {
  return spec.files.every((file) => existsSync(join(dir, spec.folder, file)));
}

function untar(archive: string, into: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("tar", ["-xjf", archive, "-C", into], (error, _out, stderr) => {
      if (!error) resolve();
      else
        reject(
          new Error(
            `Couldn't unpack the model: ${stderr.trim().slice(0, 200) || error.message}`
          )
        );
    });
  });
}

async function download(
  spec: ModelSpec,
  archive: string,
  options: InstallOptions
): Promise<void> {
  const response = await fetch(spec.url, { signal: options.signal ?? null });
  if (!response.ok || !response.body)
    throw new Error(
      `Couldn't download ${spec.label}: ${response.status} ${response.statusText}`
    );
  const total = Number(response.headers.get("content-length")) || spec.bytes;
  const hash = createHash("sha256");
  let received = 0;
  const body = Readable.fromWeb(response.body);
  body.on("data", (chunk: Buffer) => {
    hash.update(chunk);
    received += chunk.length;
    options.onProgress?.(received, total);
  });
  await pipeline(body, createWriteStream(archive, { mode: 0o600 }), {
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (
    (spec.bytes && received !== spec.bytes) ||
    hash.digest("hex") !== spec.sha256
  )
    throw new Error(
      `${spec.label} didn't match its pinned checksum, so it was discarded`
    );
}

async function install(
  spec: ModelSpec,
  dir: string,
  options: InstallOptions
): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const temp = join(dir, `.download-${randomBytes(6).toString("hex")}`);
  mkdirSync(temp);
  try {
    const archive = join(temp, "model.tar.bz2");
    await download(spec, archive, options);
    const unpacked = join(temp, "unpacked");
    mkdirSync(unpacked);
    await untar(archive, unpacked);
    if (!isInstalled(spec, unpacked))
      throw new Error(`${spec.label} is missing files`);
    rmSync(join(dir, spec.folder), { recursive: true, force: true });
    renameSync(join(unpacked, spec.folder), join(dir, spec.folder));
    return join(dir, spec.folder);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

// What's known about a model in this process: for `opencharm status` and the desktop's Settings.
function modelState(id: ModelId, dir = defaultModelsDir()): ModelState {
  if (isInstalled(MODELS[id], dir)) return { state: "ready" };
  return states.get(join(dir, id)) ?? { state: "missing" };
}

// The model's folder, downloading it first if needed. Concurrent callers share one download.
function installModel(
  id: ModelId,
  options: InstallOptions = {}
): Promise<string> {
  const spec = options.spec ?? MODELS[id];
  const dir = options.dir ?? defaultModelsDir();
  if (isInstalled(spec, dir)) return Promise.resolve(join(dir, spec.folder));
  const key = join(dir, id);
  const running = installing.get(key);
  if (running) return running;
  states.set(key, { state: "downloading", received: 0, total: spec.bytes });
  const work = install(spec, dir, {
    ...options,
    onProgress: (received, total) => {
      states.set(key, { state: "downloading", received, total });
      options.onProgress?.(received, total);
    },
  })
    .then((path) => {
      states.set(key, { state: "ready" });
      return path;
    })
    .catch((error: unknown) => {
      states.set(key, {
        state: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    })
    .finally(() => installing.delete(key));
  installing.set(key, work);
  return work;
}

export {
  MODELS,
  VoiceNotReady,
  defaultModelsDir,
  installModel,
  modelPath,
  modelState,
};
export type { ModelId, ModelSpec, ModelState };
