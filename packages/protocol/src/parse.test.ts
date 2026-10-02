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
