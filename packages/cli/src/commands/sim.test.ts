import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createSimServer } from "./sim";

let server: Server | undefined;

function built(): string {
  const dir = mkdtempSync(join(tmpdir(), "oc-sim-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>sim</title>");
  writeFileSync(join(dir, "charm_sim.wasm"), Buffer.from([0, 97, 115, 109]));
  writeFileSync(join(dir, "sim.js"), "export {}");
  mkdirSync(join(dir, "sub"));
  writeFileSync(join(dir, "..", "secret.txt"), "nope");
  return dir;
}

async function start(
  dir: string,
  url = "ws://127.0.0.1:8787/charm"
): Promise<string> {
  server = createSimServer(dir, url);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(() => {
  server?.close();
  server = undefined;
});

describe("the emulator server", () => {
  it("serves the page", async () => {
    const base = await start(built());
    const response = await fetch(`${base}/`);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("<title>sim</title>");
  });

  it("serves WebAssembly with its MIME type, so the browser can stream-compile it", async () => {
    const base = await start(built());
    expect(
      (await fetch(`${base}/charm_sim.wasm`)).headers.get("content-type")
    ).toBe("application/wasm");
    expect(
      (await fetch(`${base}/sim.js`)).headers.get("content-type")
    ).toContain("javascript");
  });

  it("tells the page where charmd is", async () => {
    const base = await start(built(), "ws://127.0.0.1:9999/charm");
    expect(await (await fetch(`${base}/config.json`)).json()).toEqual({
      url: "ws://127.0.0.1:9999/charm",
    });
  });

  it("never serves files outside the emulator folder", async () => {
    const base = await start(built());
    expect((await fetch(`${base}/..%2fsecret.txt`)).status).toBe(404);
    expect((await fetch(`${base}/%2e%2e/secret.txt`)).status).toBe(404);
  });

  it("answers 404 for missing files", async () => {
    const base = await start(built());
    expect((await fetch(`${base}/nope.js`)).status).toBe(404);
  });
});
