import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseConfig } from "../config/config";
import { type Daemon, startDaemon } from "../daemon";
import { connectFakeCharm, isOp } from "../test-support/fake-charm";
import { sendAdmin } from "./admin-client";

let daemon: Daemon | undefined;
let socket = "";

async function start() {
  const dir = mkdtempSync(join(tmpdir(), "oc-adm-"));
  const config = parseConfig({
    listen: { port: 0 },
    statePath: join(dir, "state.json"),
  });
  socket = config.adminSocket;
  daemon = await startDaemon(config, { quiet: true });
  return daemon;
}

afterEach(async () => {
  await daemon?.close();
  daemon = undefined;
});

describe("admin socket", () => {
  it("pairs a charm and reports it in status", async () => {
    const d = await start();
    const charm = await connectFakeCharm(d.url);
    const code = await charm.next(isOp("pair_code"));
    if (code.type !== "charm" || code.op !== "pair_code")
      throw new Error("no code");
    expect(
      await sendAdmin(socket, {
        cmd: "pair",
        code: code.code,
        pin: "4829",
        name: "pip",
      })
    ).toMatchObject({ name: "pip" });
    const status = await sendAdmin(socket, { cmd: "status" });
    expect(status).toMatchObject({
      charms: [{ name: "pip", connected: true, state: "locked" }],
    });
  });

  it("reports errors from the daemon as rejected promises with its message", async () => {
    await start();
    await expect(
      sendAdmin(socket, { cmd: "lock", charm: "nobody" })
    ).rejects.toThrow(/No charm called "nobody"/);
  });

  it("changes the charm's look and answers with the whole look", async () => {
    await start();
    expect(
      await sendAdmin(socket, { cmd: "look", colour: "sun", source: "agent" })
    ).toMatchObject({ colour: "sun", glyph: "#FFDF93", connected: 0 });
    expect(await sendAdmin(socket, { cmd: "look" })).toMatchObject({
      colour: "sun",
    });
  });

  it("rejects unknown commands", async () => {
    await start();
    await expect(sendAdmin(socket, { cmd: "format-disk" })).rejects.toThrow(
      /Unknown command/
    );
  });

  it("is reachable only by the owner", async () => {
    if (process.platform === "win32") return;
    await start();
    expect(statSync(socket).mode & 0o777).toBe(0o600);
  });

  it("refuses to start a second charmd on the same socket", async () => {
    const d = await start();
    const config = parseConfig({
      listen: { port: 0 },
      statePath: join(socket, "..", "state.json"),
    });
    await expect(startDaemon(config, { quiet: true })).rejects.toThrow(
      /already running/
    );
    expect(d.url).toBeTruthy();
  });

  it("releases the admin socket when the port is taken", async () => {
    const d = await start();
    const port = Number(new URL(d.url).port);
    const dir = mkdtempSync(join(tmpdir(), "oc-adm-"));
    const config = parseConfig({
      listen: { port },
      statePath: join(dir, "state.json"),
    });
    await expect(startDaemon(config, { quiet: true })).rejects.toThrow(
      /EADDRINUSE|in use/
    );
    await expect(
      sendAdmin(config.adminSocket, { cmd: "status" })
    ).rejects.toThrow(/not running/);
  });

  it("starts in a fresh folder where the state directory doesn't exist yet", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oc-adm-"));
    const config = parseConfig({
      listen: { port: 0 },
      statePath: join(dir, ".opencharm", "state.json"),
    });
    daemon = await startDaemon(config, { quiet: true });
    expect(await sendAdmin(config.adminSocket, { cmd: "status" })).toEqual({
      charms: [],
    });
    if (process.platform !== "win32")
      expect(statSync(join(dir, ".opencharm")).mode & 0o777).toBe(0o700);
  });

  it("explains how to start charmd when nothing is listening", async () => {
    await expect(
      sendAdmin(join(tmpdir(), "no-such.sock"), { cmd: "status" })
    ).rejects.toThrow(/opencharm serve/);
  });
});
