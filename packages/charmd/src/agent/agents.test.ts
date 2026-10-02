import { type IncomingMessage, type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createFakeAgent } from "./fake";
import { createHermesAgent } from "./hermes";
import { createOpenAiCompatibleAgent } from "./openai-compatible";
import type { AgentAdapter } from "./types";

type Seen = {
  url: string;
  headers: IncomingMessage["headers"];
  body: Record<string, unknown>;
};

let server: Server | undefined;

async function stub(
  lines: string[],
  status = 200
): Promise<{ url: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString()));
    req.on("end", () => {
      seen.push({
        url: req.url ?? "",
        headers: req.headers,
        body: JSON.parse(raw || "{}") as Record<string, unknown>,
      });
      res.writeHead(status, { "content-type": "text/event-stream" });
      for (const line of lines) res.write(line);
      res.end();
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    seen,
  };
}

async function text(
  agent: AgentAdapter,
  input = "hello",
  sessionKey = "opencharm-c_1"
): Promise<string> {
  let out = "";
  for await (const chunk of agent.reply({
    sessionKey,
    text: input,
    signal: new AbortController().signal,
  }))
    out += chunk;
  return out;
}

afterEach(() => {
  server?.close();
  server = undefined;
});

describe("openai-compatible agent", () => {
  it("streams chat completion deltas and sends the session as the user field", async () => {
    const { url, seen } = await stub([
      'data: {"choices":[{"delta":{"content":"Two "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"meetings."}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const agent = createOpenAiCompatibleAgent({
      baseUrl: url,
      apiKey: "k",
      model: "m",
    });
    expect(await text(agent)).toBe("Two meetings.");
    expect(seen[0]).toMatchObject({
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer k" },
      body: {
        model: "m",
        stream: true,
        user: "opencharm-c_1",
        messages: [{ role: "user", content: "hello" }],
      },
    });
  });

  it("fails with the status when the agent refuses", async () => {
    const { url } = await stub([], 401);
    const agent = createOpenAiCompatibleAgent({
      baseUrl: url,
      apiKey: "bad",
      model: "m",
    });
    await expect(text(agent)).rejects.toThrow(/401/);
  });
});

describe("hermes agent", () => {
  it("uses the Responses API with a stable conversation per charm", async () => {
    const { url, seen } = await stub([
      "event: response.output_text.delta\n",
      'data: {"type":"response.output_text.delta","delta":"Hi "}\n\n',
      ": keepalive\n\n",
      'data: {"type":"response.output_text.delta","delta":"there."}\n\n',
      'data: {"type":"response.completed"}\n\n',
    ]);
    const agent = createHermesAgent({
      baseUrl: url,
      apiKey: "k",
      model: "hermes-agent",
    });
    expect(await text(agent)).toBe("Hi there.");
    expect(seen[0]).toMatchObject({
      url: "/v1/responses",
      headers: { "x-hermes-session-key": "opencharm-c_1" },
      body: {
        model: "hermes-agent",
        stream: true,
        input: "hello",
        conversation: "opencharm-c_1",
      },
    });
  });
});

describe("fake agent", () => {
  it("echoes in chunks", async () => {
    expect(await text(createFakeAgent(), "the weather")).toBe(
      "You said: the weather."
    );
  });

  it("can be told to fail", async () => {
    await expect(text(createFakeAgent({ fail: true }))).rejects.toThrow(
      /fake agent/
    );
  });
});
