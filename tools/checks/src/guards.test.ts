import { describe, expect, it } from "vitest";

import { findAttribution, findHomePath, findSecrets, isBinary } from "./guards";

// Secret-shaped samples are assembled at run time, so this file never contains one.
const sample = (...parts: string[]) => parts.join("");

describe("the secret guard", () => {
  it("finds keys and tokens, and reports only their start", () => {
    const cases = [
      sample("-----BEGIN ", "OPENSSH PRIVATE KEY-----"),
      sample("sk-", "proj-", "a1".repeat(20)),
      sample("sk-", "ant-", "b2".repeat(20)),
      sample("gh", "p_", "c".repeat(36)),
      sample("github", "_pat_", "d".repeat(50)),
      sample("AK", "IA", "ABCDEFGHIJKLMNOP"),
      sample("npm", "_", "e".repeat(36)),
      sample("xo", "xb-", "1234567890-abc"),
      sample("AI", "za", "f".repeat(35)),
    ];
    for (const secret of cases) {
      const found = findSecrets(`const key = "${secret}";`);
      expect(found, secret.slice(0, 6)).toHaveLength(1);
      expect(found[0]?.match).not.toContain(secret.slice(10));
    }
  });

  it("leaves placeholders and ordinary text alone", () => {
    expect(findSecrets('placeholder="sk-…" OPENAI_API_KEY apiKeyEnv')).toEqual(
      []
    );
    expect(findSecrets("ask-your-agent-to-do-something-long-enough")).toEqual(
      []
    );
  });
});

describe("the authorship guard", () => {
  it("finds AI attribution trailers and lines", () => {
    expect(
      findAttribution(sample("Co-Authored", "-By: Some Model <x@y.z>"))
    ).toHaveLength(1);
    expect(findAttribution(sample("noreply@", "anthropic.com"))).toHaveLength(
      1
    );
    expect(
      findAttribution(sample("Generated with ", "[Claude Code]"))
    ).toHaveLength(1);
  });

  it("allows the rule that forbids them", () => {
    expect(
      findAttribution("no `Co-Authored-By` trailers for coding agents")
    ).toEqual([]);
  });
});

describe("the personal path guard", () => {
  it("finds the home folder of whoever runs it", () => {
    expect(
      findHomePath("--font /Users/someone/x.ttf", "/Users/someone")
    ).toHaveLength(1);
    expect(findHomePath("--font firmware/x.ttf", "/Users/someone")).toEqual([]);
  });
});

describe("binary files", () => {
  it("are told apart from text by a NUL byte", () => {
    expect(isBinary(Buffer.from([0x50, 0x4b, 0x00, 0x01]))).toBe(true);
    expect(isBinary(Buffer.from("plain text"))).toBe(false);
  });
});
