import { afterEach, describe, expect, it } from "vitest";

import type { CliContext } from "../context";
import { createStyle } from "../terminal";
import { runVoice } from "./voice";

function context() {
  let out = "";
  let err = "";
  const ctx = {
    out: { write: (s: string) => (out += s) },
    err: { write: (s: string) => (err += s) },
    style: createStyle({ color: false, trueColor: false }),
  } as unknown as CliContext;
  return { ctx, out: () => out, err: () => err };
}

afterEach(() => {
  process.exitCode = 0;
});

describe("opencharm voice", () => {
  it("lists the local voice's models and whether they're here", async () => {
    const { ctx, out } = context();
    await runVoice(ctx, [], {
      state: (id) =>
        id === "parakeet" ? { state: "ready" } : { state: "missing" },
    });
    expect(out()).toBe(
      "Parakeet (listening): installed\nSupertonic (speaking): not downloaded yet (129 MB)\n"
    );
  });

  it("installs both with progress", async () => {
    const { ctx, out } = context();
    await runVoice(ctx, ["install"], {
      install: (_id, options) => {
        options?.onProgress?.(50, 100);
        options?.onProgress?.(100, 100);
        return Promise.resolve("/models/x");
      },
    });
    expect(out()).toContain(
      "Parakeet (listening): 50%\nParakeet (listening): 100%\nParakeet (listening): installed\n"
    );
    expect(out()).toContain("Supertonic (speaking): installed\n");
  });

  it("stops with the reason when a download fails", async () => {
    const { ctx, err } = context();
    await runVoice(ctx, ["install"], {
      install: () =>
        Promise.reject(
          new Error(
            "Parakeet (listening) didn't match its pinned checksum, so it was discarded"
          )
        ),
    });
    expect(err()).toMatch(/checksum/);
    expect(process.exitCode).toBe(1);
  });
});
