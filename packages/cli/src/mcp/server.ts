import { facesData } from "@opencharm-labs/design/faces";
import { FACE_FEELINGS, FACE_STATES } from "@opencharm-labs/protocol/constants";
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
// One list for the agent: its states, then the feelings that aren't also a state's name.
const FACES = [
  ...FACE_STATES,
  ...FACE_FEELINGS.filter((feeling) => !FACE_STATES.includes(feeling)),
] as [string, ...string[]];
const COLOURS = facesData.colours.map((colour) => colour.id);
// The six by name, or one of the person's own; charmd refuses one too dark or too orange.
const COLOUR = `^(${COLOURS.join("|")}|#[0-9A-Fa-f]{6})$`;
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
      'Show a face on the charm\'s screen, with an optional short line under it: an agent state (done, thinking, working, stuck, learned, noted, asleep…) or a feeling (happy, loved, wink, curious, surprised, sad, oops, dizzy…), see the enum. For "it needs you" use notify.',
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
      const face = String(args.face);
      await send({
        cmd: "devFace",
        ...(FACE_STATES.includes(face) ? { state: face } : { feeling: face }),
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
      'Change how the charm looks when the person asks (e.g. "make yourself blue"): its glyph colour, its greeting after unlock, calm motion, or how loud it speaks. Lasts until charmd restarts.',
    inputSchema: {
      type: "object",
      properties: {
        colour: {
          type: "string",
          pattern: COLOUR,
          description:
            "cobalt is blue, lime green, lilac purple, sun yellow; white and coal light the glyphs white. Any other colour as #RRGGBB (not orange, not too dark).",
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
        volume: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description: "The speaker's volume in percent; 0 is silent.",
        },
      },
    },
    // Strict: the name and the switch that allows this tool are the person's, not the agent's.
    args: z
      .object({
        colour: z.string().regex(new RegExp(COLOUR)).optional(),
        greeting: z.string().max(40).optional(),
        motion: z.enum(["full", "calm"]).optional(),
        volume: z.number().int().min(0).max(100).optional(),
      })
      .strict(),
    run: async (args, send) => {
      const look = (await send({
        cmd: "look",
        ...args,
        source: "agent",
      })) as {
        colour: string;
        motion: string;
        greeting: string;
        volume: number;
      };
      return `The charm is now ${look.colour}, ${look.motion} motion, volume ${look.volume}%, greeting "${look.greeting}".`;
    },
  },
  {
    name: "new_conversation",
    description:
      'Start a new conversation when the person asks for one ("let\'s start over", "new conversation", "forget this chat"). Finish your reply first, briefly: once it ends, this conversation is closed and their next words start a fresh one with no history of this one. Your own long-term memory and files stay. Never call it on your own initiative.',
    inputSchema: { type: "object", properties: {} },
    // Strict: the charm that asked is the one talking; the agent can't start over someone else's.
    args: z.object({}).strict(),
    run: async (_args, send) => {
      const answer = (await send({
        cmd: "newConversation",
        source: "agent",
      })) as { charms?: unknown[] };
      // charmd acts only on a charm whose turn you're answering; with none, nothing changed.
      return answer.charms?.length
        ? "Done: when this reply ends, the next thing they say starts a new conversation."
        : "No conversation is running on a charm right now: nothing was changed.";
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
