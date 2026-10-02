import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { serveMcp } from "./mcp";

describe("serveMcp", () => {
  it("answers one JSON-RPC line per request on stdout, and nothing for notifications", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const lines: string[] = [];
    output.on("data", (chunk: Buffer) =>
      lines.push(...chunk.toString().split("\n").filter(Boolean))
    );
    const done = serveMcp(input, output, {
      version: "1.0.0",
      send: () => Promise.resolve({ connected: 1 }),
    });
    input.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })}\n`
    );
    input.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`
    );
    input.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "say", arguments: { text: "Hi" } } })}\n`
    );
    input.end();
    await done;
    expect(lines.map((l) => (JSON.parse(l) as { id: number }).id)).toEqual([
      1, 2,
    ]);
  });
});
