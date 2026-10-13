import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { sendAdmin } from "./admin/admin-client";
import { parseConfig } from "./config/config";
import { type Daemon, startDaemon } from "./daemon";
import {
  type FakeCharm,
  connectFakeCharm,
  isOp,
} from "./test-support/fake-charm";

let daemon: Daemon | undefined;

async function start(
  timings?: {
    unpairedIdleMs?: number;
    pairCodeMs?: number;
    heartbeatMs?: number;
  },
  extra: Record<string, unknown> = {},
  options: { announce?: (port: number) => () => Promise<void> } = {}
) {
  const dir = mkdtempSync(join(tmpdir(), "oc-daemon-"));
  daemon = await startDaemon(
    parseConfig({
      listen: { port: 0 },
      statePath: join(dir, "state.json"),
      ...extra,
    }),
    { timings, quiet: true, ...options }
  );
  return { daemon, statePath: join(dir, "state.json") };
}

async function pair(d: Daemon, pin = "482913") {
  const charm = await connectFakeCharm(d.url);
  const code = await charm.next(isOp("pair_code"));
  if (code.type !== "charm" || code.op !== "pair_code")
    throw new Error("no code");
  await d.admin.pair({ code: code.code, pin, name: "pip" });
  const paired = await charm.next(isOp("paired"));
  if (paired.type !== "charm" || paired.op !== "paired")
    throw new Error("not paired");
  return { charm, token: paired.token };
}

afterEach(async () => {
  await daemon?.close();
  daemon = undefined;
});

describe("charmd over a real socket", () => {
  it("pairs, locks on every connection, and unlocks with the PIN", async () => {
    const { daemon: d } = await start();
    const { charm, token } = await pair(d);
    await charm.next(isOp("locked"));
    charm.send({ type: "charm", op: "unlock", pin: "482913" });
    await charm.next(isOp("unlocked"));
    charm.ws.close();

    const again = await connectFakeCharm(d.url, token);
    expect(await again.next(isOp("locked"))).toMatchObject({ reason: "boot" });
    again.send({ type: "charm", op: "unlock", pin: "482913" });
    await again.next(isOp("unlocked"));
  });

  it("blocks after five wrong PINs until the admin unlocks it", async () => {
    const { daemon: d } = await start();
    const { charm } = await pair(d);
    await charm.next(isOp("locked"));
    for (let i = 0; i < 5; i++) {
      charm.send({ type: "charm", op: "unlock", pin: "0000" });
      await charm.next(isOp("locked"));
    }
    expect(d.admin.status().charms[0]).toMatchObject({ blocked: true });
    await d.admin.unlock({ charm: "pip" });
    await charm.next(isOp("unlocked"));
  });

  it("delivers a remote lock within 2 seconds", async () => {
    const { daemon: d } = await start();
    const { charm } = await pair(d);
    await charm.next(isOp("locked"));
    charm.send({ type: "charm", op: "unlock", pin: "482913" });
    await charm.next(isOp("unlocked"));
    const started = Date.now();
    await d.admin.lock({ charm: "pip" });
    expect(await charm.next(isOp("locked"), 2000)).toMatchObject({
      reason: "remote",
    });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("revokes: sends revoked, closes, and rejects the old token", async () => {
    const { daemon: d } = await start();
    const { charm, token } = await pair(d);
    await d.admin.revoke({ charm: "pip" });
    await charm.next(isOp("revoked"));
    expect(await charm.closeCode).toBe(4001);
    const again = await connectFakeCharm(d.url, token);
    await again.next(isOp("revoked"));
    expect(await again.closeCode).toBe(4001);
  });

  it("answers listen and audio before unlock with locked", async () => {
    const { daemon: d } = await start();
    const { charm } = await pair(d);
    await charm.next(isOp("locked"));
    charm.send({ type: "listen", state: "start", mode: "manual" });
    await charm.next(isOp("locked"));
    charm.sendAudio(200);
    await charm.next(isOp("locked"));
  });

  it("closes the connection on an oversized frame", async () => {
    const { daemon: d } = await start();
    const charm = await connectFakeCharm(d.url);
    await charm.next(isOp("pair_code"));
    charm.sendAudio(20_000);
    expect(await charm.closeCode).toBe(1009);
  });

  it("closes an unpaired connection after the idle timeout", async () => {
    const { daemon: d } = await start({ unpairedIdleMs: 200 });
    const charm = await connectFakeCharm(d.url);
    await charm.next(isOp("pair_code"));
    expect(await charm.closeCode).toBe(1008);
  });

  it("refreshes the pairing code on the same connection", async () => {
    const { daemon: d } = await start({ pairCodeMs: 150 });
    const charm = await connectFakeCharm(d.url);
    const first = await charm.next(isOp("pair_code"));
    const second = await charm.next(isOp("pair_code"));
    expect(second).not.toEqual(first);
  });

  it("stores no plaintext token or PIN, with owner-only permissions", async () => {
    const { daemon: d, statePath } = await start();
    const { token } = await pair(d, "482913");
    const raw = readFileSync(statePath, "utf8");
    expect(raw).not.toContain(token);
    expect(raw).not.toContain("482913");
    if (process.platform !== "win32")
      expect(statSync(statePath).mode & 0o777).toBe(0o600);
  });

  it("reports the newest connection in status when a charm reconnects", async () => {
    const { daemon: d } = await start();
    const { token } = await pair(d);
    const again = await connectFakeCharm(d.url, token);
    await again.next(isOp("locked"));
    again.send({ type: "charm", op: "unlock", pin: "482913" });
    await again.next(isOp("unlocked"));
    expect(d.admin.status().charms[0]).toMatchObject({ state: "unlocked" });
  });

  it("reports what charmd and each connected charm run, in status", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oc-daemon-"));
    daemon = await startDaemon(
      parseConfig({ listen: { port: 0 }, statePath: join(dir, "state.json") }),
      { quiet: true, identity: "cli@0.2.0 (abc1234)", starter: "def5678" }
    );
    const d = daemon;
    const { token } = await pair(d);
    const build = { kind: "emulator", version: "cli@0.2.0", commit: "abc1234" };
    const again = await connectFakeCharm(d.url, token, { build });
    await again.next(isOp("locked"));
    const status = d.admin.status();
    expect(status.charmd).toBe("cli@0.2.0 (abc1234)");
    expect(status.starter).toBe("def5678");
    expect(status.charms[0]).toMatchObject({ build });
  });

  it("tells charms where to connect on /ota/", async () => {
    const { daemon: d } = await start();
    const response = await fetch(
      d.url.replace("ws://", "http://").replace("/charm", "/ota/"),
      {
        method: "POST",
        body: "{}",
      }
    );
    expect(await response.json()).toMatchObject({ websocket: { url: d.url } });
  });

  it("drops a connection that stopped answering pings, and keeps one that answers", async () => {
    const { daemon: d } = await start({ heartbeatMs: 40 });
    const open = (autoPong: boolean) =>
      new Promise<WebSocket>((resolve) => {
        const ws = new WebSocket(d.url, ["opencharm"], { autoPong });
        ws.once("open", () => resolve(ws));
      });
    const dead = await open(false); // a laptop asleep, a charm out of Wi-Fi
    const alive = await open(true);
    const closed = await new Promise<boolean>((resolve) => {
      dead.once("close", () => resolve(true));
      setTimeout(() => resolve(false), 1000);
    });
    expect(closed).toBe(true);
    expect(alive.readyState).toBe(WebSocket.OPEN);
    alive.close();
  });

  it("refuses pairing with a wrong or expired code", async () => {
    const { daemon: d } = await start();
    await expect(
      d.admin.pair({ code: "000000", pin: "1234", name: "pip" })
    ).rejects.toThrow(/code/);
  });
});

describe("the charm's look", () => {
  async function unlock(charm: FakeCharm) {
    charm.send({ type: "charm", op: "unlock", pin: "482913" });
    await charm.next(isOp("unlocked"));
  }

  it("arrives right before unlocked, on every unlock", async () => {
    const { daemon: d } = await start(undefined, {
      charm: { name: "Momo", colour: "cobalt" },
    });
    const { charm, token } = await pair(d);
    await unlock(charm);
    const kinds = charm.received.map((m) =>
      m.type === "charm" ? m.op : m.type
    );
    expect(kinds.slice(-2)).toEqual(["look", "unlocked"]);
    expect(charm.received.at(-2)).toEqual({
      type: "charm",
      op: "look",
      name: "Momo",
      glyph: "#9DB6FF",
      greeting: "Hi! I'm Momo.",
      sleep_ms: 240_000,
      motion: "full",
    });
    charm.ws.close();

    const again = await connectFakeCharm(d.url, token);
    await again.next(isOp("locked"));
    expect(
      again.received.some((m) => m.type === "charm" && m.op === "look")
    ).toBe(false);
    await unlock(again);
    expect(again.received.at(-2)).toMatchObject({ op: "look", name: "Momo" });
  });

  it("is named after the agent's AGENTS.md heading when the config names none", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oc-agent-"));
    writeFileSync(join(dir, "AGENTS.md"), "# Pip\n\nYou are Pip.\n");
    const { daemon: d } = await start(undefined, {
      agent: { adapter: "acp", command: ["true"], cwd: dir },
    });
    expect(await d.admin.look({})).toMatchObject({
      name: "Pip",
      greeting: "Hi! I'm Pip.",
    });
  });

  it("a change reaches every unlocked charm at once, and is kept for the next unlock", async () => {
    const { daemon: d } = await start();
    const { charm, token } = await pair(d);
    await unlock(charm);
    const result = await d.admin.look({ colour: "lime", motion: "calm" });
    expect(result).toEqual({
      name: "Charm",
      colour: "lime",
      glyph: "#D6F78A",
      greeting: "Hi! I'm Charm.",
      sleepAfterMinutes: 4,
      motion: "calm",
      connected: 1,
    });
    await charm.next(isOp("look")); // the one sent with the unlock
    expect(await charm.next(isOp("look"))).toMatchObject({
      glyph: "#D6F78A",
      motion: "calm",
    });
    charm.ws.close();
    const again = await connectFakeCharm(d.url, token);
    await again.next(isOp("locked"));
    await unlock(again);
    expect(again.received.at(-2)).toMatchObject({ glyph: "#D6F78A" });
  });

  it("returns the current look for an empty request, and sends nothing", async () => {
    const { daemon: d } = await start();
    const { charm } = await pair(d);
    await unlock(charm);
    const before = charm.received.length;
    expect(await d.admin.look({})).toMatchObject({
      colour: "white",
      connected: 0,
    });
    expect(charm.received.length).toBe(before);
  });

  it("refuses the agent when agentCanChangeLook is off, but not the person", async () => {
    const { daemon: d } = await start(undefined, {
      charm: { agentCanChangeLook: false },
    });
    await expect(
      d.admin.look({ colour: "cobalt", source: "agent" })
    ).rejects.toThrow(/agentCanChangeLook/);
    expect(await d.admin.look({})).toMatchObject({ colour: "white" });
    expect(await d.admin.look({ colour: "cobalt" })).toMatchObject({
      colour: "cobalt",
    });
  });

  it("refuses a look the charm can't show, and keeps the old one", async () => {
    const { daemon: d } = await start();
    await expect(d.admin.look({ colour: "orange" })).rejects.toThrow(/colour/);
    await expect(
      d.admin.look({ agentCanChangeLook: true, source: "agent" })
    ).rejects.toThrow();
    expect(await d.admin.look({})).toMatchObject({ colour: "white" });
  });
});

describe("a full turn over a real socket", () => {
  async function unlocked(d: Daemon) {
    const { charm } = await pair(d);
    await charm.next(isOp("locked"));
    charm.send({ type: "charm", op: "unlock", pin: "482913" });
    await charm.next(isOp("unlocked"));
    return charm;
  }

  it("hold, speak, release: faces, heard text, speech frames and back to idle", async () => {
    const { daemon: d } = await start();
    const charm = await unlocked(d);
    charm.send({ type: "listen", state: "start", mode: "manual" });
    expect(await charm.next(isOp("face"))).toMatchObject({
      state: "listening",
    });
    for (let i = 0; i < 5; i++) charm.ws.send(Buffer.from([0xf8, 1, 2, 3]));
    charm.send({ type: "listen", state: "stop" });
    expect(await charm.next(isOp("face"))).toMatchObject({ state: "thinking" });
    expect(await charm.next((m) => m.type === "stt")).toMatchObject({
      text: "hello",
    });
    expect(
      await charm.next((m) => m.type === "tts" && m.state === "start")
    ).toBeTruthy();
    expect(
      await charm.next((m) => m.type === "tts" && m.state === "sentence_start")
    ).toMatchObject({ text: "You said: hello." });
    await charm.next((m) => m.type === "tts" && m.state === "stop", 10_000);
    expect(await charm.next(isOp("face"))).toMatchObject({ state: "idle" });
    expect(charm.audioFrames()).toBeGreaterThan(0);
  });

  it("a remote lock cancels an answer in progress", async () => {
    const { daemon: d } = await start();
    const charm = await unlocked(d);
    charm.send({ type: "listen", state: "start", mode: "manual" });
    charm.ws.send(Buffer.from([0xf8, 1]));
    charm.send({ type: "listen", state: "stop" });
    await charm.next(isOp("face"));
    await d.admin.lock({ charm: "pip" });
    await charm.next(
      (m) => m.type === "charm" && m.op === "locked" && m.reason === "remote"
    );
    charm.send({ type: "listen", state: "start", mode: "manual" });
    expect(await charm.next(isOp("locked"))).toMatchObject({ op: "locked" });
  });
});

describe("turn log", () => {
  it("hands one timing entry per turn to the log option, even when startup is quiet", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oc-daemon-"));
    const entries: Array<Record<string, unknown>> = [];
    daemon = await startDaemon(
      parseConfig({ listen: { port: 0 }, statePath: join(dir, "state.json") }),
      {
        quiet: true,
        log: (entry) => entries.push(entry),
      }
    );
    const { charm } = await pair(daemon);
    await charm.next(isOp("locked"));
    charm.send({ type: "charm", op: "unlock", pin: "482913" });
    await charm.next(isOp("unlocked"));
    charm.send({ type: "listen", state: "start", mode: "manual" });
    charm.ws.send(Buffer.from([0xf8, 1]));
    charm.send({ type: "listen", state: "stop" });
    await charm.next(
      (m) => m.type === "charm" && m.op === "face" && m.state === "idle",
      10_000
    );
    expect(entries).toEqual([
      expect.objectContaining({
        event: "turn",
        outcome: "done",
        sttMs: expect.any(Number) as unknown,
      }),
    ]);
  });
});

describe("dev commands", () => {
  it("push a face with a line, and spoken words, to a connected charm", async () => {
    const { daemon: d } = await start();
    const { charm } = await pair(d);
    await charm.next(isOp("locked"));
    charm.send({ type: "charm", op: "unlock", pin: "482913" });
    await charm.next(isOp("unlocked"));
    await d.admin.devFace({
      charm: "pip",
      state: "needs_you",
      text: "Approve the deploy?",
    });
    expect(await charm.next(isOp("face"))).toEqual({
      type: "charm",
      op: "face",
      state: "needs_you",
      text: "Approve the deploy?",
    });
    await d.admin.devSay({ charm: "pip", text: "Hello from charmd." });
    expect(
      await charm.next((m) => m.type === "tts" && m.state === "sentence_start")
    ).toMatchObject({ text: "Hello from charmd." });
  });

  it("refuse an unknown face state", async () => {
    const { daemon: d } = await start();
    await pair(d);
    await expect(
      d.admin.devFace({ charm: "pip", state: "speaking" })
    ).rejects.toThrow(/state/);
  });

  it("need the charm to be unlocked", async () => {
    const { daemon: d } = await start();
    await pair(d);
    await expect(d.admin.devSay({ charm: "pip", text: "hi" })).rejects.toThrow(
      /unlocked/
    );
  });

  it("dev ask shows a question on the charm and returns its answer", async () => {
    const { daemon: d } = await start();
    const { charm } = await pair(d);
    await charm.next(isOp("locked"));
    charm.send({ type: "charm", op: "unlock", pin: "482913" });
    await charm.next(isOp("unlocked"));
    const answer = d.admin.devAsk({
      charm: "pip",
      text: "Deploy now?",
      yes: "SHIP",
    });
    const question = await charm.next(isOp("ask"));
    expect(question).toMatchObject({ text: "Deploy now?", yes: "SHIP" });
    if (question.type !== "charm" || question.op !== "ask")
      throw new Error("no ask");
    charm.send({ type: "charm", op: "answer", id: question.id, yes: true });
    expect(await answer).toEqual({ answer: "yes" });
  });

  it("dev ask refuses a locked charm", async () => {
    const { daemon: d } = await start();
    const { charm } = await pair(d);
    await charm.next(isOp("locked"));
    await expect(
      d.admin.devAsk({ charm: "pip", text: "Deploy now?" })
    ).rejects.toThrow(/unlocked/);
  });

  it("the charm tools work without naming a charm: the unlocked one answers", async () => {
    const { daemon: d } = await start();
    const { charm } = await pair(d);
    await charm.next(isOp("locked"));
    await expect(d.admin.devFace({ state: "done" })).rejects.toThrow(
      /No charm is connected and unlocked/
    );
    charm.send({ type: "charm", op: "unlock", pin: "482913" });
    await charm.next(isOp("unlocked"));
    await d.admin.devFace({ state: "done", text: "Built." });
    expect(await charm.next(isOp("face"))).toMatchObject({
      state: "done",
      text: "Built.",
    });
    const answer = d.admin.devAsk({ text: "Ship it?" });
    const question = await charm.next(isOp("ask"));
    if (question.type !== "charm" || question.op !== "ask")
      throw new Error("no ask");
    charm.send({ type: "charm", op: "answer", id: question.id, yes: false });
    expect(await answer).toEqual({ answer: "no" });
  });
});

describe("replies as text over a real socket (spec 003)", () => {
  async function turnOf(d: Daemon, kind: string) {
    const charm = await connectFakeCharm(d.url, undefined, {
      build: { kind, version: "desktop@0.0.0", commit: "abc1234" },
    });
    const code = await charm.next(isOp("pair_code"));
    if (code.type !== "charm" || code.op !== "pair_code")
      throw new Error("no code");
    await d.admin.pair({ code: code.code, pin: "482913", name: kind });
    await charm.next(isOp("locked"));
    charm.send({ type: "charm", op: "unlock", pin: "482913" });
    await charm.next(isOp("unlocked"));
    charm.send({ type: "listen", state: "start", mode: "manual" });
    for (let i = 0; i < 5; i++) charm.ws.send(Buffer.from([0xf8, 1, 2, 3]));
    charm.send({ type: "listen", state: "stop" });
    await charm.next((m) => m.type === "tts" && m.state === "stop", 15_000);
    return charm.audioFrames();
  }

  it("the desktop charm shows replies as text when they're off; a charm on a board still speaks", async () => {
    const { daemon: d } = await start(undefined, { speakReplies: false });
    expect(await turnOf(d, "desktop")).toBe(0);
    expect(await turnOf(d, "emulator")).toBeGreaterThan(0);
  });

  it("the admin command turns speaking back on from the next turn", async () => {
    const { daemon: d } = await start(undefined, { speakReplies: false });
    expect(await d.admin.replies({ speak: true })).toEqual({ speak: true });
    expect(await turnOf(d, "desktop")).toBeGreaterThan(0);
    await expect(d.admin.replies({ speak: "yes" })).rejects.toThrow();
  });
});

describe("typed text over a real socket (spec 013)", () => {
  it("is answered as text once unlocked, and refused before", async () => {
    const { daemon: d } = await start();
    const charm = await connectFakeCharm(d.url, undefined, {
      build: { kind: "desktop", version: "desktop@0.0.0", commit: "abc1234" },
    });
    const code = await charm.next(isOp("pair_code"));
    if (code.type !== "charm" || code.op !== "pair_code")
      throw new Error("no code");
    await d.admin.pair({ code: code.code, pin: "482913", name: "desk" });
    await charm.next(isOp("locked"));
    charm.send({ type: "charm", op: "text", text: "hello?" });
    expect(await charm.next(isOp("locked"))).toBeTruthy();
    charm.send({ type: "charm", op: "unlock", pin: "482913" });
    await charm.next(isOp("unlocked"));
    charm.send({ type: "charm", op: "text", text: "hello?" });
    expect(
      await charm.next(
        (m) => m.type === "tts" && m.state === "sentence_start",
        10_000
      )
    ).toMatchObject({ text: "You said: hello?." });
    await charm.next((m) => m.type === "tts" && m.state === "stop", 10_000);
    expect(charm.audioFrames()).toBe(0);
  });

  it("is offered to the desktop charm only, and ignored from any other (a board has no keyboard)", async () => {
    const { daemon: d } = await start();
    const charm = await connectFakeCharm(d.url, undefined, {
      build: { kind: "board", version: "board@0.0.0", commit: "abc1234" },
    });
    const code = await charm.next(isOp("pair_code"));
    if (code.type !== "charm" || code.op !== "pair_code")
      throw new Error("no code");
    await d.admin.pair({ code: code.code, pin: "482913", name: "board" });
    await charm.next(isOp("locked"));
    charm.send({ type: "charm", op: "unlock", pin: "482913" });
    await charm.next(isOp("unlocked"));
    expect(charm.received.find((m) => m.type === "hello")).not.toHaveProperty(
      "features.text"
    );
    charm.send({ type: "charm", op: "text", text: "hello?" });
    await expect(charm.next((m) => m.type === "tts", 1500)).rejects.toThrow();
  });
});

describe("new conversations over a real socket (spec 003)", () => {
  it("starts over after a long pause, and when asked from the computer", async () => {
    let clock = 0;
    const entries: Record<string, unknown>[] = [];
    const dir = mkdtempSync(join(tmpdir(), "oc-daemon-"));
    const config = parseConfig({
      listen: { port: 0 },
      statePath: join(dir, "state.json"),
      newConversationAfterMinutes: 30,
    });
    const d = await startDaemon(config, {
      quiet: true,
      now: () => clock,
      log: (entry) => entries.push(entry),
    });
    daemon = d;
    const charm = await connectFakeCharm(d.url, undefined, {
      build: { kind: "desktop", version: "desktop@0.0.0", commit: "abc1234" },
    });
    const code = await charm.next(isOp("pair_code"));
    if (code.type !== "charm" || code.op !== "pair_code")
      throw new Error("no code");
    const { id } = await d.admin.pair({
      code: code.code,
      pin: "482913",
      name: "desk",
    });
    await charm.next(isOp("locked"));
    charm.send({ type: "charm", op: "unlock", pin: "482913" });
    await charm.next(isOp("unlocked"));
    // Each typed reply stays on screen for its reading time (2 s, real time), hence the test's 30 s.
    const turn = async () => {
      charm.send({ type: "charm", op: "text", text: "hello?" });
      await charm.next((m) => m.type === "tts" && m.state === "stop", 10_000);
    };
    const started = () => entries.filter((e) => e.event === "new-conversation");

    await turn();
    clock += 30 * 60_000;
    await turn();
    expect(started()).toEqual([]);
    clock += 30 * 60_000 + 1;
    await turn();
    expect(started()).toEqual([
      {
        event: "new-conversation",
        session: `opencharm-${id}`,
        reason: "idle",
      },
    ]);

    expect(
      await sendAdmin(config.adminSocket, { cmd: "newConversation" })
    ).toEqual({ charms: ["desk"] });
    expect(started().at(-1)).toMatchObject({ reason: "asked" });
  }, 30_000);
});

describe("the charm's battery (spec 009)", () => {
  it("is offered in every hello, kept once unlocked, and shown in status", async () => {
    const { daemon: d } = await start();
    const charm = await connectFakeCharm(d.url, undefined, {
      build: { kind: "board", version: "firmware@0.0.0", commit: "abc1234" },
    });
    const code = await charm.next(isOp("pair_code"));
    const hello = charm.received.find((m) => m.type === "hello");
    expect(hello).toMatchObject({ features: { battery: true } });
    if (code.type !== "charm" || code.op !== "pair_code")
      throw new Error("no code");
    await d.admin.pair({ code: code.code, pin: "482913", name: "board" });
    await charm.next(isOp("locked"));
    charm.send({ type: "charm", op: "unlock", pin: "482913" });
    await charm.next(isOp("unlocked"));
    charm.send({
      type: "charm",
      op: "battery",
      percent: 62,
      charging: true,
      usb: true,
    });
    await expect
      .poll(() => d.admin.status().charms[0]?.battery)
      .toEqual({ percent: 62, charging: true, usb: true });
    // Locked from the computer: the charm stops reporting, so status shows no frozen reading.
    await d.admin.lock({ charm: "board" });
    await charm.next((m) => m.type === "charm" && m.op === "locked");
    expect(d.admin.status().charms[0]?.battery).toBeUndefined();
  });
});

describe("charms waiting to pair, and being found (spec 002)", () => {
  it("lists a charm waiting to pair with its code and kind, and not once it's paired", async () => {
    const { daemon: d } = await start();
    const charm = await connectFakeCharm(d.url, undefined, {
      build: { kind: "board", version: "firmware@0.0.0", commit: "abc1234" },
    });
    const code = await charm.next(isOp("pair_code"));
    if (code.type !== "charm" || code.op !== "pair_code")
      throw new Error("no code");
    expect(d.admin.waiting().charms).toEqual([
      {
        code: code.code,
        kind: "board",
        expiresIn: expect.any(Number) as unknown,
      },
    ]);
    await d.admin.pair({ code: code.code, pin: "482913", name: "board" });
    expect(d.admin.waiting().charms).toEqual([]);
  });

  it("takes charms on a network listener of its own, and keeps its loopback address", async () => {
    const announced: number[] = [];
    const announce = (port: number) => {
      announced.push(port);
      return () => Promise.resolve();
    };
    const { daemon: d } = await start(
      undefined,
      { network: { host: "127.0.0.1", port: 0 }, allowInsecureRemote: true },
      { announce }
    );
    expect(d.url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/charm$/);
    expect(announced).toHaveLength(1);
    const networkPort = announced[0];
    expect(networkPort).not.toBe(Number(/:(\d+)\/charm$/.exec(d.url)?.[1]));
    // A charm on the network listener is the same charmd: it gets a pairing code.
    const charm = await connectFakeCharm(`ws://127.0.0.1:${networkPort}/charm`);
    await charm.next(isOp("pair_code"));
    expect(d.admin.waiting().charms).toHaveLength(1);
  });

  it("refuses a network listener without allowInsecureRemote", () => {
    expect(() => parseConfig({ network: { port: 8787 } })).toThrow(
      /allowInsecureRemote/
    );
  });

  it("announces itself on the network only when it listens beyond this computer", async () => {
    const announced: number[] = [];
    let stopped = 0;
    const announce = (port: number) => {
      announced.push(port);
      return () => {
        stopped += 1;
        return Promise.resolve();
      };
    };
    const local = await start(undefined, {}, { announce });
    expect(announced).toEqual([]);
    await local.daemon.close();

    const network = await start(
      undefined,
      { listen: { host: "0.0.0.0", port: 0 }, allowInsecureRemote: true },
      { announce }
    );
    const port = Number(/:(\d+)\/charm$/.exec(network.daemon.url)?.[1]);
    expect(announced).toEqual([port]);
    await network.daemon.close();
    expect(stopped).toBe(1);

    const quiet = await start(
      undefined,
      {
        listen: { host: "0.0.0.0", port: 0 },
        allowInsecureRemote: true,
        discoverable: false,
      },
      { announce }
    );
    expect(announced).toEqual([port]);
    await quiet.daemon.close();
  });
});
