import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLineQueue } from "./prompt";

describe("createLineQueue", () => {
  it("hands out piped lines one per prompt, even when they arrive together", async () => {
    const next = createLineQueue(Readable.from(["4829\n4829\n"]));
    expect(await next()).toBe("4829");
    expect(await next()).toBe("4829");
  });

  it("resolves an empty string when input ends, instead of hanging", async () => {
    const next = createLineQueue(Readable.from(["only-one\n"]));
    expect(await next()).toBe("only-one");
    expect(await next()).toBe("");
  });
});
