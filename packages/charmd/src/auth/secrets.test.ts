import { describe, expect, it } from "vitest";

import {
  generatePairCode,
  generateToken,
  hashPin,
  hashToken,
  verifyPin,
} from "./secrets";

describe("tokens", () => {
  it("are 43 base64url characters (32 random bytes)", () => {
    expect(generateToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("are different every time", () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it("hash to 64 hex characters that don't contain the token", () => {
    const token = generateToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashToken(token)).toBe(hash);
  });
});

describe("PINs", () => {
  it("verify only with the same PIN", async () => {
    const stored = await hashPin("482913");
    expect(await verifyPin("482913", stored)).toBe(true);
    expect(await verifyPin("482914", stored)).toBe(false);
  });

  it("are salted, so the same PIN hashes differently", async () => {
    expect(await hashPin("1234")).not.toBe(await hashPin("1234"));
  });

  it("never store the PIN itself", async () => {
    expect(await hashPin("482913")).not.toContain("482913");
  });

  it("reject a malformed stored hash instead of throwing", async () => {
    expect(await verifyPin("1234", "garbage")).toBe(false);
  });
});

describe("pairing codes", () => {
  it("are six digits, leading zeros kept", () => {
    for (let i = 0; i < 200; i++) expect(generatePairCode()).toMatch(/^\d{6}$/);
  });
});
