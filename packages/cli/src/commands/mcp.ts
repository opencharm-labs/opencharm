import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

import { createCharmMcp } from "../mcp/server";

type McpDeps = {
  version: string;
  send: (request: Record<string, unknown>) => Promise<unknown>;
};

// `opencharm mcp`: the charm's tools for an agent, over stdio. stdout carries only protocol
// messages (one JSON-RPC message per line); anything for people goes to stderr.
async function serveMcp(
  input: Readable,
  output: Writable,
  deps: McpDeps
): Promise<void> {
  const mcp = createCharmMcp(deps);
  const pending: Array<Promise<void>> = [];
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    // Answer each request as soon as it's ready: an `ask` waiting for the person mustn't hold up a ping.
    pending.push(
      mcp.handle(line).then((reply) => {
        if (reply !== undefined) output.write(`${reply}\n`);
      })
    );
  }
  await Promise.all(pending);
}

export { serveMcp };
