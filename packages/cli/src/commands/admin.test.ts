import { describe, expect, it, vi } from "vitest";

import type { CliContext } from "../context";
import { createStyle } from "../terminal";
import { runAdminCommand } from "./admin";

function context() {
  const out: string[] = [];
  const err: string[] = [];
  const ctx = {
    out: { write: (s: string) => out.push(s) },
    err: { write: (s: string) => err.push(s) },
    style: createStyle({ color: false, trueColor: false }),
    canAnimate: false,
    version: "0.0.0",
    signal: "#FF5A1F",
  } as unknown as CliContext;
  return { ctx, out: () => out.join(""), err: () => err.join("") };
}

const SOCKET = "/tmp/test.sock";

describe("opencharm pair", () => {
  it("asks for the PIN twice and sends the pairing request", async () => {
    const { ctx, out } = context();
    const send = vi.fn().mockResolvedValue({ id: "c_1", name: "pip" });
    const prompt = vi
      .fn()
      .mockResolvedValueOnce("4829")
      .mockResolvedValueOnce("4829");
    await runAdminCommand(ctx, "pair", ["482913", "--name", "pip"], {
      socket: SOCKET,
      send,
      prompt,
    });
    expect(send).toHaveBeenCalledWith(SOCKET, {
      cmd: "pair",
      code: "482913",
      pin: "4829",
      name: "pip",
    });
    expect(out()).toContain("Paired pip");
  });

  it("stops when the two PINs differ", async () => {
    const { ctx, err } = context();
    const send = vi.fn();
    const prompt = vi
      .fn()
      .mockResolvedValueOnce("4829")
      .mockResolvedValueOnce("4828");
    await runAdminCommand(ctx, "pair", ["482913"], {
      socket: SOCKET,
      send,
      prompt,
    });
    expect(send).not.toHaveBeenCalled();
    expect(err()).toContain("didn't match");
  });

  it("needs the code from the charm's screen", async () => {
    const { ctx, err } = context();
    await runAdminCommand(ctx, "pair", [], {
      socket: SOCKET,
      send: vi.fn(),
      prompt: vi.fn(),
    });
    expect(err()).toContain("opencharm pair <code>");
  });
});

describe("lock, unlock, revoke", () => {
  it.each(["lock", "unlock", "revoke"])(
    "%s sends the charm name",
    async (cmd) => {
      const { ctx } = context();
      const send = vi.fn().mockResolvedValue({ connected: 1 });
      await runAdminCommand(ctx, cmd, ["pip"], {
        socket: SOCKET,
        send,
        prompt: vi.fn(),
      });
      expect(send).toHaveBeenCalledWith(SOCKET, { cmd, charm: "pip" });
    }
  );

  it("reports the daemon's error on stderr and sets a failing exit code", async () => {
    const { ctx, err } = context();
    const send = vi.fn().mockRejectedValue(new Error('No charm called "x"'));
    process.exitCode = 0;
    await runAdminCommand(ctx, "lock", ["x"], {
      socket: SOCKET,
      send,
      prompt: vi.fn(),
    });
    expect(err()).toContain('No charm called "x"');
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});

describe("opencharm status", () => {
  it("lists charms with their state", async () => {
    const { ctx, out } = context();
    const send = vi.fn().mockResolvedValue({
      charms: [
        {
          id: "c_1",
          name: "pip",
          blocked: false,
          failedTries: 0,
          connected: true,
          state: "unlocked",
        },
      ],
    });
    await runAdminCommand(ctx, "status", [], {
      socket: SOCKET,
      send,
      prompt: vi.fn(),
    });
    expect(out()).toMatch(/pip\s+unlocked/);
  });

  it("shows what charmd and each connected charm run (spec 015)", async () => {
    const { ctx, out } = context();
    const send = vi.fn().mockResolvedValue({
      charmd: "cli@0.2.0 (abc1234)",
      starter: "def5678",
      charms: [
        {
          id: "c_1",
          name: "pip",
          blocked: false,
          failedTries: 0,
          connected: true,
          state: "unlocked",
          build: { kind: "emulator", version: "cli@0.2.0", commit: "abc1234" },
        },
      ],
    });
    await runAdminCommand(ctx, "status", [], {
      socket: SOCKET,
      send,
      prompt: vi.fn(),
    });
    expect(out()).toContain("charmd cli@0.2.0 (abc1234)");
    expect(out()).toContain("workspace from starter def5678");
    expect(out()).toMatch(/pip\s+unlocked\s+emulator cli@0\.2\.0 \(abc1234\)/);
  });

  it("says so when nothing is paired", async () => {
    const { ctx, out } = context();
    const send = vi.fn().mockResolvedValue({ charms: [] });
    await runAdminCommand(ctx, "status", [], {
      socket: SOCKET,
      send,
      prompt: vi.fn(),
    });
    expect(out()).toContain("No charms paired yet");
  });
});

describe("opencharm dev", () => {
  it("face sends a state and an optional line", async () => {
    const { ctx } = context();
    const send = vi.fn().mockResolvedValue({ connected: 1 });
    await runAdminCommand(
      ctx,
      "dev",
      ["face", "pip", "needs_you", "Approve", "the", "deploy?"],
      { socket: SOCKET, send, prompt: vi.fn() }
    );
    expect(send).toHaveBeenCalledWith(SOCKET, {
      cmd: "devFace",
      charm: "pip",
      state: "needs_you",
      text: "Approve the deploy?",
    });
  });

  it("say sends the words", async () => {
    const { ctx } = context();
    const send = vi.fn().mockResolvedValue({ connected: 1 });
    await runAdminCommand(ctx, "dev", ["say", "pip", "Hello", "there."], {
      socket: SOCKET,
      send,
      prompt: vi.fn(),
    });
    expect(send).toHaveBeenCalledWith(SOCKET, {
      cmd: "devSay",
      charm: "pip",
      text: "Hello there.",
    });
  });

  it("ask shows a question and prints the answer", async () => {
    const { ctx, out } = context();
    const send = vi.fn().mockResolvedValue({ answer: "yes" });
    await runAdminCommand(ctx, "dev", ["ask", "pip", "Deploy", "now?"], {
      socket: SOCKET,
      send,
      prompt: vi.fn(),
    });
    expect(send).toHaveBeenCalledWith(SOCKET, {
      cmd: "devAsk",
      charm: "pip",
      text: "Deploy now?",
    });
    expect(out()).toContain("pip said yes");
  });

  it("explains its usage", async () => {
    const { ctx, err } = context();
    await runAdminCommand(ctx, "dev", ["dance"], {
      socket: SOCKET,
      send: vi.fn(),
      prompt: vi.fn(),
    });
    expect(err()).toContain("opencharm dev face <charm> <state> [text]");
  });
});

describe("opencharm look", () => {
  const LOOK = {
    name: "Momo",
    colour: "cobalt",
    glyph: "#9DB6FF",
    greeting: "Hi! I'm Momo.",
    sleepAfterMinutes: 4,
    motion: "calm",
  };

  it("shows the current look when given no flags", async () => {
    const { ctx, out } = context();
    const send = vi.fn().mockResolvedValue({ ...LOOK, connected: 0 });
    await runAdminCommand(ctx, "look", [], {
      socket: SOCKET,
      send,
      prompt: vi.fn(),
    });
    expect(send).toHaveBeenCalledWith(SOCKET, { cmd: "look" });
    expect(out()).toContain("Momo");
    expect(out()).toContain("cobalt");
    expect(out()).toContain("sleeps after 4 min");
    expect(out()).toContain('"Hi! I\'m Momo."');
  });

  it("sends the colour, greeting and motion, and says it lasts until charmd restarts", async () => {
    const { ctx, out } = context();
    const send = vi.fn().mockResolvedValue({ ...LOOK, connected: 1 });
    await runAdminCommand(
      ctx,
      "look",
      ["--colour", "cobalt", "--greeting", "", "--motion", "calm"],
      { socket: SOCKET, send, prompt: vi.fn() }
    );
    expect(send).toHaveBeenCalledWith(SOCKET, {
      cmd: "look",
      colour: "cobalt",
      greeting: "",
      motion: "calm",
    });
    expect(out()).toContain("Sent to 1 charm");
    expect(out()).toContain("until charmd restarts");
  });

  it("prints charmd's reason when it refuses", async () => {
    const { ctx, err } = context();
    const send = vi
      .fn()
      .mockRejectedValue(new Error("colour: the colour is one of white"));
    await runAdminCommand(ctx, "look", ["--colour", "orange"], {
      socket: SOCKET,
      send,
      prompt: vi.fn(),
    });
    expect(err()).toContain("the colour is one of");
  });
});
