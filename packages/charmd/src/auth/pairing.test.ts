import { describe, expect, it } from "vitest";

import { PairingRegistry } from "./pairing";

function registry(options: { maxPending?: number } = {}) {
  let now = 0;
  let next = 100000;
  const reg = new PairingRegistry({
    ttlMs: 300_000,
    maxPending: options.maxPending ?? 4,
    now: () => now,
    generate: () => String(next++),
  });
  return { reg, advance: (ms: number) => (now += ms) };
}

describe("PairingRegistry", () => {
  it("issues a code for a connection and hands the connection back on claim", () => {
    const { reg } = registry();
    const { code, expiresIn } = reg.issue("conn-1");
    expect(expiresIn).toBe(300);
    expect(reg.claim(code)).toBe("conn-1");
  });

  it("lets a code be claimed only once", () => {
    const { reg } = registry();
    const { code } = reg.issue("conn-1");
    reg.claim(code);
    expect(reg.claim(code)).toBeUndefined();
  });

  it("expires codes after the time to live", () => {
    const { reg, advance } = registry();
    const { code } = reg.issue("conn-1");
    advance(300_001);
    expect(reg.claim(code)).toBeUndefined();
  });

  it("replaces a connection's old code when it gets a new one", () => {
    const { reg } = registry();
    const first = reg.issue("conn-1").code;
    const second = reg.issue("conn-1").code;
    expect(reg.claim(first)).toBeUndefined();
    expect(reg.claim(second)).toBe("conn-1");
  });

  it("caps pending pairings so a flood of unpaired sockets can't fill the code space", () => {
    const { reg } = registry({ maxPending: 2 });
    reg.issue("a");
    reg.issue("b");
    expect(() => reg.issue("c")).toThrow(/too many/i);
  });

  it("frees a slot when a connection goes away", () => {
    const { reg } = registry({ maxPending: 1 });
    const { code } = reg.issue("a");
    reg.release("a");
    expect(reg.claim(code)).toBeUndefined();
    expect(() => reg.issue("b")).not.toThrow();
  });

  it("never hands out a code that is already pending", () => {
    let calls = 0;
    const reg = new PairingRegistry({
      ttlMs: 1000,
      maxPending: 4,
      now: () => 0,
      generate: () => (calls++ < 3 ? "111111" : "222222"),
    });
    expect(reg.issue("a").code).toBe("111111");
    expect(reg.issue("b").code).toBe("222222");
  });
});
