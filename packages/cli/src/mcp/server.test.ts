import { describe, expect, it } from "vitest";

import { createCharmMcp } from "./server";

type Sent = Record<string, unknown>;

function setup(reply: (request: Sent) => unknown = () => ({ connected: 1 })) {
  const calls: Sent[] = [];
  const mcp = createCharmMcp({
    version: "1.2.3",
    send: (request) => {
      calls.push(request);
      try {
        return Promise.resolve(reply(request));
      } catch (error) {
        return Promise.reject(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    },
  });
  const rpc = async (method: string, params?: unknown, id: number | null = 1) =>
    JSON.parse(
      (await mcp.handle(
        JSON.stringify({ jsonrpc: "2.0", id, method, params })
      )) ?? "null"
    ) as {
      id: number;
      result?: Record<string, unknown>;
      error?: { code: number; message: string };
    };
  const call = (name: string, args: unknown) =>
    rpc("tools/call", { name, arguments: args });
  return { mcp, rpc, call, calls };
}

describe("the charm's MCP server", () => {
  it("agrees on a protocol version both sides know, and offers tools", async () => {
    const { rpc } = setup();
    const known = await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(known.result).toMatchObject({
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "opencharm", version: "1.2.3" },
    });
    const newer = await rpc("initialize", { protocolVersion: "2099-01-01" });
    expect(newer.result?.protocolVersion).toBe("2025-06-18");
  });

  it("answers notifications with nothing, and pings with an empty result", async () => {
    const { mcp, rpc } = setup();
    expect(
      await mcp.handle(
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
      )
    ).toBeUndefined();
    expect((await rpc("ping")).result).toEqual({});
  });

  it("lists say, show_face, ask, notify and set_look, each with an input schema", async () => {
    const { rpc } = setup();
    const { result } = await rpc("tools/list");
    const tools = result?.tools as Array<{
      name: string;
      description: string;
      inputSchema: { type: string; required?: string[] };
    }>;
    expect(tools.map((t) => t.name)).toEqual([
      "say",
      "show_face",
      "ask",
      "notify",
      "set_look",
    ]);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("say speaks on the charm", async () => {
    const { call, calls } = setup();
    const { result } = await call("say", { text: "Time for the call." });
    expect(calls).toEqual([{ cmd: "devSay", text: "Time for the call." }]);
    expect(result).toEqual({
      content: [{ type: "text", text: "Said on the charm." }],
    });
  });

  it("show_face shows an agent state with an optional line", async () => {
    const { call, calls } = setup();
    await call("show_face", { face: "done", line: "Done!" });
    expect(calls).toEqual([{ cmd: "devFace", state: "done", text: "Done!" }]);
  });

  it("ask returns the person's answer", async () => {
    const { call, calls } = setup(() => ({ answer: "yes" }));
    const { result } = await call("ask", {
      question: "Send the email to Ada?",
      yes: "SEND",
    });
    expect(calls).toEqual([
      { cmd: "devAsk", text: "Send the email to Ada?", yes: "SEND" },
    ]);
    expect(result).toEqual({ content: [{ type: "text", text: "yes" }] });
  });

  it("notify lights the orange 'it needs you' face with a line", async () => {
    const { call, calls } = setup();
    await call("notify", { text: "The build failed." });
    expect(calls).toEqual([
      { cmd: "devFace", state: "needs_you", text: "The build failed." },
    ]);
  });

  it("set_look changes the colour, greeting or motion, as the agent", async () => {
    const { call, calls } = setup(() => ({
      name: "Pip",
      colour: "cobalt",
      glyph: "#9DB6FF",
      greeting: "Hi! I'm Pip.",
      sleepAfterMinutes: 4,
      motion: "calm",
      connected: 1,
    }));
    const { result } = await call("set_look", {
      colour: "cobalt",
      motion: "calm",
    });
    expect(calls).toEqual([
      { cmd: "look", colour: "cobalt", motion: "calm", source: "agent" },
    ]);
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: 'The charm is now cobalt, calm motion, greeting "Hi! I\'m Pip.".',
        },
      ],
    });
  });

  it("set_look can't rename the charm or pick a colour it doesn't have", async () => {
    const { call, calls } = setup();
    expect((await call("set_look", { colour: "orange" })).error?.code).toBe(
      -32602
    );
    expect((await call("set_look", { name: "Bob" })).error?.code).toBe(-32602);
    expect(calls).toEqual([]);
  });

  it("reports charmd's errors as tool errors the agent can read", async () => {
    const { call } = setup(() => {
      throw new Error("No charm is connected and unlocked.");
    });
    const { result } = await call("say", { text: "Hi" });
    expect(result).toEqual({
      isError: true,
      content: [{ type: "text", text: "No charm is connected and unlocked." }],
    });
  });

  it("rejects unknown tools and bad arguments as invalid params", async () => {
    const { call, calls } = setup();
    expect((await call("dance", {})).error?.code).toBe(-32602);
    expect((await call("show_face", { face: "smug" })).error?.code).toBe(
      -32602
    );
    expect((await call("say", {})).error?.code).toBe(-32602);
    expect(calls).toEqual([]);
  });

  it("answers anything that isn't a single request object with invalid request, and keeps going", async () => {
    const { mcp, rpc } = setup();
    for (const line of [
      "null",
      "5",
      '"x"',
      "[]",
      '[{"jsonrpc":"2.0","id":1,"method":"ping"}]',
    ])
      expect(JSON.parse((await mcp.handle(line)) ?? "null")).toMatchObject({
        id: null,
        error: { code: -32600 },
      });
    expect((await rpc("ping")).result).toEqual({});
  });

  it("answers unknown methods and broken JSON with JSON-RPC errors", async () => {
    const { mcp, rpc } = setup();
    expect((await rpc("resources/list")).error?.code).toBe(-32601);
    const broken = JSON.parse((await mcp.handle("{nope")) ?? "null") as {
      id: null;
      error: { code: number };
    };
    expect(broken).toMatchObject({ id: null, error: { code: -32700 } });
  });
});
