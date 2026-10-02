import { describe, expect, it } from "vitest";

import { parseSse } from "./sse";

function stream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(chunks: string[]) {
  const events = [];
  for await (const event of parseSse(stream(chunks))) events.push(event);
  return events;
}

describe("parseSse", () => {
  it("yields data lines as events, across chunk boundaries", async () => {
    expect(
      await collect(['data: {"a":', "1}\n\ndata: [DO", "NE]\n\n"])
    ).toEqual([
      { event: undefined, data: '{"a":1}' },
      { event: undefined, data: "[DONE]" },
    ]);
  });

  it("keeps the event name and ignores comments and keepalives", async () => {
    expect(
      await collect([
        ": keepalive\n\nevent: hermes.tool.progress\ndata: {}\n\n",
      ])
    ).toEqual([{ event: "hermes.tool.progress", data: "{}" }]);
  });

  it("handles CRLF line endings", async () => {
    expect(await collect(["data: x\r\n\r\n"])).toEqual([
      { event: undefined, data: "x" },
    ]);
  });
});
