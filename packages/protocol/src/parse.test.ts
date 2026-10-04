import { describe, expect, it } from "vitest";

import { LIMITS } from "./constants";
import { loadFixtures } from "./fixtures";
import { CLIENT_KINDS, SERVER_KINDS, messageKind } from "./messages";
import { parseClientMessage, parseServerMessage } from "./parse";

const valid = loadFixtures("valid");
const invalid = loadFixtures("invalid");

function parserFor(direction: "client" | "server") {
  return direction === "client" ? parseClientMessage : parseServerMessage;
}

describe("valid fixtures", () => {
  it.each(valid)("$name parses", (fixture) => {
    const result = parserFor(fixture.direction)(fixture.raw);
    const expected: unknown = JSON.parse(fixture.raw);
    expect(result).toEqual({ ok: true, message: expected });
  });

  it("cover every client message kind", () => {
    const covered = valid
      .filter((f) => f.direction === "client")
      .map((f) =>
        messageKind(JSON.parse(f.raw) as { type: string; op?: string })
      );
    expect(new Set(covered)).toEqual(new Set(CLIENT_KINDS));
  });

  it("cover every server message kind", () => {
    const covered = valid
      .filter((f) => f.direction === "server")
      .map((f) =>
        messageKind(JSON.parse(f.raw) as { type: string; op?: string })
      );
    expect(new Set(covered)).toEqual(new Set(SERVER_KINDS));
  });
});

describe("invalid fixtures", () => {
  it.each(invalid)("$name fails with $error", (fixture) => {
    const result = parserFor(fixture.direction)(fixture.raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(fixture.error);
  });
});

describe("size limit", () => {
  it("rejects text frames over the JSON limit before parsing them", () => {
    const big = JSON.stringify({
      type: "abort",
      reason: "x".repeat(LIMITS.maxJsonBytes),
    });
    const result = parseClientMessage(big);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("too_large");
  });

  it("measures bytes, not characters", () => {
    const emoji = "😀".repeat(Math.ceil(LIMITS.maxJsonBytes / 4) + 1);
    const result = parseServerMessage(
      JSON.stringify({ type: "stt", text: emoji })
    );
    expect(result.ok).toBe(false);
  });
});

describe("unknown fields", () => {
  it("ignores extra fields a newer XiaoZhi might add", () => {
    const result = parseClientMessage(
      JSON.stringify({ type: "abort", session_id: "s1", reason: "x", extra: 1 })
    );
    expect(result.ok).toBe(true);
  });
});

describe("a charm's build (spec 015)", () => {
  // The shared hello with a different build: these parse into something other than their input.
  const hello = (build: object) => {
    const base = loadFixtures("valid").find((f) => f.name === "client-hello")!;
    return JSON.stringify({ ...(JSON.parse(base.raw) as object), build });
  };

  it("keeps a future kind and ignores fields it doesn't know, so newer charms still connect", () => {
    const parsed = parseClientMessage(
      hello({
        kind: "phone",
        version: "cli@9.0.0",
        commit: "abc1234",
        board_rev: "B",
      })
    );
    expect(
      parsed.ok && parsed.message.type === "hello" && parsed.message.build
    ).toEqual({
      kind: "phone",
      version: "cli@9.0.0",
      commit: "abc1234",
    });
  });

  it("drops a build it can't print safely, and still accepts the hello", () => {
    const parsed = parseClientMessage(
      hello({
        kind: "emulator",
        version: "cli@0.2.0\u001b]52;c;aGk=\u0007",
        commit: "abc1234",
      })
    );
    expect(parsed.ok).toBe(true);
    expect(
      parsed.ok && parsed.message.type === "hello" && parsed.message.build
    ).toBeUndefined();
  });
});
