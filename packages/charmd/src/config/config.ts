import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { z } from "zod";

import { ACP_AGENTS, ACP_AGENT_NAMES } from "../agent/acp-agents";
import { lookFields } from "../look";

type LoadOptions = { searchPaths?: string[] };

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
const DEFAULT_SEARCH_PATHS = [
  join(process.cwd(), "opencharm.json"),
  "/etc/opencharm/charmd.json",
];

// Keys may sit in the config file (root:charmd 0640 in production) or in an environment variable.
const secret = {
  apiKey: z.string().min(1).optional(),
  apiKeyEnv: z.string().min(1).optional(),
};

const voiceSchema = z.discriminatedUnion("provider", [
  z
    .object({ provider: z.literal("fake"), transcript: z.string().optional() })
    .strict(),
  z
    .object({
      provider: z.literal("local"),
      whisperModel: z.string().optional(),
      sayVoice: z.string().optional(),
    })
    .strict(),
  z
    .object({
      provider: z.literal("openai"),
      ...secret,
      baseUrl: z.url().optional(),
      sttModel: z.string().optional(),
      ttsModel: z.string().optional(),
      voice: z.string().optional(),
    })
    .strict(),
]);

const agentSchema = z.discriminatedUnion("adapter", [
  z.object({ adapter: z.literal("fake") }).strict(),
  z
    .object({
      adapter: z.literal("openai-compatible"),
      baseUrl: z.url(),
      model: z.string().min(1),
      ...secret,
    })
    .strict(),
  z
    .object({
      adapter: z.literal("openclaw"),
      baseUrl: z.url(),
      agentId: z.string().min(1).default("main"),
      ...secret,
    })
    .strict(),
  z
    .object({
      adapter: z.literal("hermes"),
      baseUrl: z.url().default("http://127.0.0.1:8642/v1"),
      model: z.string().min(1).default("hermes-agent"),
      ...secret,
    })
    .strict(),
  // Any agent that speaks ACP over stdio: a known one by name, or its command.
  z
    .object({
      adapter: z.literal("acp"),
      agent: z.enum(ACP_AGENT_NAMES).optional(),
      command: z.array(z.string().min(1)).min(1).optional(),
      cwd: z.string().min(1).default("."),
      projects: z.array(z.string().min(1)).optional(),
      mode: z.string().min(1).optional(),
      // The charm's tools (say, show_face, ask, notify, set_look) as an MCP server in every session.
      charmTools: z.boolean().default(true),
    })
    .strict(),
]);

// The charm's identity (spec 014). The name defaults to the agent's AGENTS.md heading and the greeting
// to "Hi! I'm {name}.", so both stay optional here.
const charmSchema = z
  .object({
    ...lookFields,
    colour: lookFields.colour.unwrap().default("white"),
    sleepAfterMinutes: lookFields.sleepAfterMinutes.unwrap().default(4),
    motion: lookFields.motion.unwrap().default("full"),
    // Off: the agent's set_look tool is refused.
    agentCanChangeLook: z.boolean().default(true),
  })
  .strict();

const schema = z
  .object({
    listen: z
      .object({
        host: z.string().min(1).default("127.0.0.1"),
        port: z.number().int().min(0).max(65535).default(8787),
      })
      .prefault({}),
    statePath: z
      .string()
      .min(1)
      .default(join(homedir(), ".opencharm", "state.json")),
    adminSocket: z.string().min(1).optional(),
    publicUrl: z.url().optional(),
    maxConnections: z.number().int().min(1).max(1024).default(16),
    allowInsecureRemote: z.boolean().default(false),
    voice: voiceSchema.default({ provider: "fake" }),
    agent: agentSchema.default({ adapter: "fake" }),
    turnTimeoutSeconds: z.number().int().min(5).max(600).default(60),
    logTranscripts: z.boolean().default(false),
    charm: charmSchema.prefault({}),
  })
  .strict();

type ParsedConfig = z.infer<typeof schema>;
type VoiceConfig = ParsedConfig["voice"];
type CharmConfig = ParsedConfig["charm"];
// OpenClaw is an OpenAI-compatible agent whose model name is derived from its agent id; an ACP
// agent is resolved to the command that starts it.
type AcpConfig = {
  adapter: "acp";
  name: string;
  command: string[];
  cwd: string;
  projects?: string[];
  sessionMeta?: Record<string, unknown>;
  mode?: string;
  env?: Record<string, string>;
  charmTools: boolean;
};
type AgentConfig =
  | Exclude<ParsedConfig["agent"], { adapter: "openclaw" | "acp" }>
  | (Extract<ParsedConfig["agent"], { adapter: "openclaw" }> & {
      model: string;
    })
  | AcpConfig;
type CharmdConfig = Omit<ParsedConfig, "adminSocket" | "agent"> & {
  adminSocket: string;
  agent: AgentConfig;
};

function defaultAdminSocket(statePath: string): string {
  // Windows has no Unix sockets for this; a named pipe gives the same "local user only" channel.
  return process.platform === "win32"
    ? "\\\\.\\pipe\\opencharm-charmd"
    : join(dirname(statePath), "charmd.sock");
}

function expandPath(path: string, base: string): string {
  if (path === "~" || path.startsWith("~/"))
    return join(homedir(), path.slice(2));
  return resolve(base, path);
}

function resolveAgent(agent: ParsedConfig["agent"], base: string): AgentConfig {
  if (agent.adapter === "openclaw")
    return { ...agent, model: `openclaw:${agent.agentId}` };
  if (agent.adapter !== "acp") return agent;
  if (Boolean(agent.agent) === Boolean(agent.command))
    throw new Error(
      'Invalid charmd config: an ACP agent needs exactly one of "agent" (a known name) or "command"'
    );
  const known:
    | {
        command: readonly string[];
        sessionMeta?: object;
        mode?: string;
        env?: Record<string, string>;
      }
    | undefined = agent.agent ? ACP_AGENTS[agent.agent] : undefined;
  return {
    adapter: "acp",
    name: agent.agent ?? "acp",
    command: known ? [...known.command] : (agent.command ?? []),
    ...(known?.sessionMeta
      ? { sessionMeta: known.sessionMeta as Record<string, unknown> }
      : {}),
    ...(known?.env ? { env: { ...known.env } } : {}),
    ...((agent.mode ?? known?.mode) ? { mode: agent.mode ?? known?.mode } : {}),
    cwd: expandPath(agent.cwd, base),
    charmTools: agent.charmTools,
    ...(agent.projects
      ? { projects: agent.projects.map((p) => expandPath(p, base)) }
      : {}),
  };
}

function parseConfig(input: unknown, baseDir?: string): CharmdConfig {
  const result = schema.safeParse(input);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid charmd config: ${problems}`);
  }
  const config = result.data;
  // charmd speaks plain WebSocket and relies on Caddy for TLS, so it must not face the network by accident.
  if (!LOOPBACK.has(config.listen.host) && !config.allowInsecureRemote) {
    throw new Error(
      `Invalid charmd config: listen.host ${config.listen.host} is not loopback; put Caddy in front, or set "allowInsecureRemote": true for a trusted LAN`
    );
  }
  const statePath =
    baseDir && !isAbsolute(config.statePath)
      ? resolve(baseDir, config.statePath)
      : config.statePath;
  const base = baseDir ?? process.cwd();
  const agent = resolveAgent(config.agent, base);
  return {
    ...config,
    statePath,
    adminSocket: config.adminSocket ?? defaultAdminSocket(statePath),
    agent,
  };
}

function loadConfig(path?: string, options: LoadOptions = {}): CharmdConfig {
  if (path) {
    if (!existsSync(path)) throw new Error(`Config file not found: ${path}`);
    return parseConfig(JSON.parse(readFileSync(path, "utf8")), dirname(path));
  }
  const found = (options.searchPaths ?? DEFAULT_SEARCH_PATHS).find((p) =>
    existsSync(p)
  );
  return found
    ? parseConfig(JSON.parse(readFileSync(found, "utf8")), dirname(found))
    : parseConfig({});
}

export { loadConfig, parseConfig };
export type { AcpConfig, AgentConfig, CharmConfig, CharmdConfig, VoiceConfig };
