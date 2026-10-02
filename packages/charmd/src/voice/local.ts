import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { oggOpusToPcm, pcmToOggOpus } from "../audio/opus-codec";
import type { VoiceProvider } from "./types";
import { readWav, writeWav } from "./wav";

type LocalVoiceOptions = {
  whisperModel?: string;
  whisperCommand?: string;
  sayVoice?: string;
};

function defaultWhisperModel(): string {
  return join(homedir(), ".opencharm", "models", "ggml-base.en.bin");
}

function run(
  command: string,
  args: string[],
  signal: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { signal, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }
        const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
        reject(
          new Error(
            missing
              ? `The local voice needs "${command}" installed`
              : `${command} failed: ${stderr.trim().slice(0, 200)}`
          )
        );
      }
    );
  });
}

// Everything on this machine, no key: macOS `say` speaks, whisper.cpp listens. Audio lives only in a
// private temp folder for the length of one call.
async function withTempDir<T>(work: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "opencharm-voice-"));
  try {
    return await work(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function createLocalVoice(options: LocalVoiceOptions): VoiceProvider {
  const model = options.whisperModel ?? defaultWhisperModel();
  return {
    name: "local",
    transcribe: (ogg, signal) =>
      withTempDir(async (dir) => {
        const wav = join(dir, "in.wav");
        writeFileSync(wav, writeWav(oggOpusToPcm(ogg, 16000), 16000));
        const out = await run(
          options.whisperCommand ?? "whisper-cli",
          ["-m", model, "-f", wav, "-nt", "-np", "-l", "auto"],
          signal
        );
        return out.replace(/\s+/g, " ").trim();
      }),
    synthesize: (text, signal) =>
      withTempDir(async (dir) => {
        // The text goes through a file, never the command line, so nothing an agent writes can become a flag.
        const input = join(dir, "text.txt");
        const wav = join(dir, "out.wav");
        writeFileSync(input, text);
        await run(
          "say",
          [
            ...(options.sayVoice ? ["-v", options.sayVoice] : []),
            "-f",
            input,
            "-o",
            wav,
            "--file-format=WAVE",
            "--data-format=LEI16@24000",
          ],
          signal
        );
        const { pcm, sampleRate } = readWav(readFileSync(wav));
        if (sampleRate !== 24000)
          throw new Error(`say produced ${sampleRate} Hz, expected 24000`);
        return pcmToOggOpus(pcm, 24000);
      }),
  };
}

export { createLocalVoice, defaultWhisperModel };
export type { LocalVoiceOptions };
