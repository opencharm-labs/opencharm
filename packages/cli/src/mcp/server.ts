import { facesData } from "@opencharm-labs/design/faces";
import { z } from "zod";

type Send = (request: Record<string, unknown>) => Promise<unknown>;
type McpOptions = { version: string; send: Send };
type Rpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
};
type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  args: z.ZodType<Record<string, unknown>>;
  run: (args: Record<string, unknown>, send: Send) => Promise<string>;
};

// Newest first; the first one is offered when the client asks for one we don't know.
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const FACES = facesData.states.map((state) => state.id) as [
  string,
  ...string[],
];
const COLOURS = facesData.colours.map((colour) => colour.id) as [
  string,
  ...string[],
];
// Limits match what the charm shows (spec 011).
const line = z.string().min(1).max(200);
const label = z.string().min(1).max(12);

const TOOLS: Tool[] = [
  {
    name: "say",
    description:
      "Speak a short message out loud on the charm when it is idle (a reminder from a scheduled task, a heads-up). During your reply it is refused: put the words in your reply instead.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "One or two short spoken sentences, no markdown.",
        },
      },
      required: ["text"],
    },
    args: z.object({ text: z.string().min(1).max(500) }),
    run: async (args, send) => {
      await send({ cmd: "devSay", text: args.text });
      return "Said on the charm.";
    },
  },
  {
    name: "show_face",
    description:
      "Show a face on the charm's screen, with an optional short line under it. Faces are agent states: done, thinking, working, stuck, learned, noted, asleep and more (see the enum).",
    inputSchema: {
      type: "object",
      properties: {
        face: { type: "string", enum: FACES },
        line: {
          type: "string",
          description: "Optional, up to 200 characters.",
        },
      },
      required: ["face"],
    },
    args: z.object({ face: z.enum(FACES), line: line.optional() }),
    run: async (args, send) => {
      await send({
        cmd: "devFace",
        state: args.face,
        ...(args.line ? { text: args.line } : {}),
      });
      return `Showing ${String(args.face)}.`;
    },
  },
  {
    name: "ask",
    description:
      'Ask the person holding the charm a yes/no question before doing something (hold the key = yes, press = no, no answer in 30 s = no). Returns "yes" or "no". Keep the question short: it\'s read on a small screen.',
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: 'Up to 200 characters, e.g. "Send the email to Ada?"',
        },
        yes: {
          type: "string",
          description: "Label for yes, up to 12 characters (default ALLOW).",
        },
        no: {
          type: "string",
          description: "Label for no, up to 12 characters (default NO).",
        },
      },
      required: ["question"],
    },
    args: z.object({
      question: line,
      yes: label.optional(),
      no: label.optional(),
    }),
    run: async (args, send) => {
      const { answer } = (await send({
        cmd: "devAsk",
        text: args.question,
        ...(args.yes ? { yes: args.yes } : {}),
        ...(args.no ? { no: args.no } : {}),
      })) as { answer: "yes" | "no" };
      return answer;
    },
  },
  {
    name: "notify",
    description:
      "Light the charm's orange \"it needs you\" face with a short line, for something that needs the person's attention. It stays until they press the key.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Up to 200 characters." },
      },
      required: ["text"],
    },
    args: z.object({ text: line }),
    run: async (args, send) => {
      await send({ cmd: "devFace", state: "needs_you", text: args.text });
      return "The charm is showing it.";
    },
  },
  {
    name: "set_look",
    description:
      'Change how the charm looks when the person asks (e.g. "make yourself blue"): its glyph colour, its greeting after unlock, or calm motion. Lasts until charmd restarts.',
    inputSchema: {
      type: "object",
      properties: {
        colour: {
          type: "string",
          enum: COLOURS,
          description:
            "cobalt is blue, lime green, lilac purple, sun yellow; white and coal light the glyphs white.",
        },
        greeting: {
          type: "string",
          description: 'Said after unlock, up to 40 characters; "" for none.',
        },
        motion: {
          type: "string",
          enum: ["full", "calm"],
          description: "calm: no glances or bounces, for less movement.",
        },
      },
    },
    // Strict: the name and the switch that allows this tool are the person's, not the agent's.
    args: z
      .object({
        colour: z.enum(COLOURS).optional(),
        greeting: z.string().max(40).optional(),
        motion: z.enum(["full", "calm"]).optional(),
      })
      .strict(),
    run: async (args, send) => {
      const look = (await send({
        cmd: "look",
        ...args,
        source: "agent",
      })) as { colour: string; motion: string; greeting: string };
      return `The charm is now ${look.colour}, ${look.motion} motion, greeting "${look.greeting}".`;
    },
  },
];

const reply = (id: Rpc["id"], result: unknown) =>
  JSON.stringify({ jsonrpc: "2.0", id, result });
const fail = (id: Rpc["id"], code: number, message: string) =>
  JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });

// The charm as an MCP server over stdio (newline-delimited JSON-RPC): tools forward to charmd's admin
// socket. Small on purpose: initialize, ping, tools/list, tools/call; nothing else is offered.
function createCharmMcp({ version, send }: McpOptions) {
  async function call(id: Rpc["id"], params: unknown): Promise<string> {
    const { name, arguments: raw } = (params ?? {}) as {
      name?: string;
      arguments?: unknown;
    };
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) return fail(id, -32602, `Unknown tool: ${String(name)}`);
    const args = tool.args.safeParse(raw ?? {});
    if (!args.success)
      return fail(
        id,
        -32602,
        `Invalid arguments for ${tool.name}: ${args.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`
      );
    try {
      return reply(id, {
        content: [{ type: "text", text: await tool.run(args.data, send) }],
      });
    } catch (error) {
      return reply(id, {
        isError: true,
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : String(error),
          },
        ],
      });
    }
  }

  async function handle(raw: string): Promise<string | undefined> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fail(null, -32700, "Parse error");
    }
    // One request object per line; batches (allowed before 2025-06-18) aren't offered.
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return fail(
        null,
        -32600,
        "Invalid request: send one JSON-RPC object per line"
      );
    const message = parsed as Rpc;
    const { id, method, params } = message;
    if (id === undefined || id === null) return undefined; // a notification: nothing to answer
    switch (method) {
      case "initialize": {
        const asked = (params as { protocolVersion?: string } | undefined)
          ?.protocolVersion;
        return reply(id, {
          protocolVersion:
            asked && VERSIONS.includes(asked) ? asked : VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "opencharm", version },
          instructions:
            "Tools for the charm: a small device with a face, a speaker and one key that the person carries. Use them sparingly; everything is seen or heard by the person and anyone nearby.",
        });
      }
      case "ping":
        return reply(id, {});
      case "tools/list":
        return reply(id, {
          tools: TOOLS.map(({ name, description, inputSchema }) => ({
            name,
            description,
            inputSchema,
          })),
        });
      case "tools/call":
        return call(id, params);
      default:
        return fail(id, -32601, `Method not found: ${String(method)}`);
    }
  }

  return { handle };
}

export { createCharmMcp };
