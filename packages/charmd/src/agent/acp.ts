import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { Readable, Writable } from "node:stream";

import * as acp from "@agentclientprotocol/sdk";

import type { AgentAdapter } from "./types";

type AcpAgentOptions = {
  // Shown in failure lines ("Can't reach Claude Code"): a known agent's name, or "acp".
  name?: string;
  command: string[];
  cwd: string;
  // Extra folders the agent may work in (ACP `additionalDirectories`).
  projects?: string[];
  env?: Record<string, string>;
  // Agent-specific session options, sent as `_meta` on session/new.
  sessionMeta?: Record<string, unknown>;
  // An ACP session mode to switch to (`session/set_mode`), e.g. Claude Code's "acceptEdits".
  mode?: string;
  // MCP servers for every session, e.g. the charm's own tools (`opencharm mcp`).
  mcpServers?: acp.McpServer[];
  log?: (line: string) => void;
};
type Item = { text: string } | { end: true } | { error: Error };
type Session = { agent: Agent; sessionId: string };
type Agent = {
  child: ChildProcessWithoutNullStreams;
  context: acp.ClientContext;
  canAttach: boolean;
  failure: () => Error;
  // Prefer the process's own exit reason over the "connection closed" that reaches us first.
  explain: (error: unknown) => Promise<Error>;
};

const AUTH_REQUIRED = -32000;
const NO_ACCESS: acp.ClientCapabilities = {
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
};

// A tiny push/pull queue: ACP notifications arrive as callbacks, the reply is an async generator.
function queue() {
  const items: Item[] = [];
  let wake: (() => void) | undefined;
  return {
    push(item: Item) {
      items.push(item);
      wake?.();
    },
    async next(): Promise<Item> {
      while (items.length === 0)
        await new Promise<void>((resolve) => (wake = resolve));
      wake = undefined;
      return items.shift() as Item;
    },
  };
}

// Agents compare paths literally, so a symlinked folder (macOS /tmp is /private/tmp) would look
// like somewhere else and every edit would need permission.
function realFolder(path: string, what: string): string {
  try {
    return realpathSync(path);
  } catch {
    throw new Error(`${what} ${path} not found`);
  }
}

// "Write /Users/me/charm/charm/notes/x.md" → "write notes/x.md": short enough to read on the charm.
function describeAction(title: string, cwd: string): string {
  // MCP tools arrive as "mcp__<server>__<tool>".
  const mcp = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(title.trim());
  if (mcp) return `use the ${mcp[1]} tool ${mcp[2]}`;
  const text = title
    .trim()
    .split(`${cwd}/`)
    .join("")
    .split(`${dirname(cwd)}/`)
    .join("../")
    .split(homedir())
    .join("~");
  const action = text.charAt(0).toLowerCase() + text.slice(1);
  return action.length > 120 ? `${action.slice(0, 119)}…` : action;
}

function friendly(error: unknown, program: string): Error {
  if (error instanceof acp.RequestError) {
    if (error.code === AUTH_REQUIRED)
      return new Error(
        `${program} needs you to log in first: run it once in a terminal and log in`
      );
    // Agents' own errors arrive as "Internal error" with the real reason in data.details.
    const details = (error.data as { details?: unknown } | undefined)?.details;
    if (typeof details === "string") return new Error(details);
  }
  return error instanceof Error ? error : new Error(String(error));
}

// charmd as an ACP client (agentclientprotocol.com, v1 over stdio). One agent process serves every
// charm, each charm gets its own session. charmd offers no file or terminal access: the agent uses
// its own tools, and its own rules decide what it may do. A permission request during a turn becomes
// a question on the charm (spec 011); outside a turn nobody can answer, so it's refused.
function createAcpAgent(options: AcpAgentOptions): AgentAdapter {
  const [program = "", ...args] = options.command;
  const log = options.log ?? (() => undefined);
  const sessions = new Map<string, Promise<Session>>();
  const listeners = new Map<string, (update: acp.SessionUpdate) => void>();
  type Asker = {
    ask: (action: string) => Promise<boolean>;
    signal: AbortSignal;
  };
  const askers = new Map<string, Asker>();
  let starting: Promise<Agent> | undefined;
  let running: Agent | undefined;
  let child: ChildProcessWithoutNullStreams | undefined;
  const home = () => realFolder(options.cwd, "the workspace");

  async function launch(): Promise<Agent> {
    const proc = spawn(program, args, {
      cwd: home(),
      env: { ...process.env, ...options.env },
      // npx and friends are .cmd files on Windows, which only start through a shell.
      shell: process.platform === "win32",
    });
    child = proc;
    let stderr = "";
    let failure: Error | undefined;
    proc.stderr.on(
      "data",
      (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-400))
    );
    proc.stdin.on("error", () => undefined);
    const connection = acp
      .client({ name: "charmd" })
      // Permission requests become a question on the charm. Answers are always "once": a yes or a
      // no must not turn into a lasting rule inside the agent.
      .onRequest(acp.methods.client.session.requestPermission, async (ctx) => {
        const { options: offered, toolCall, sessionId } = ctx.params;
        const title = toolCall.title ?? "use a tool";
        const allow = offered.find((o) => o.kind === "allow_once");
        const reject = offered.find((o) => o.kind === "reject_once");
        const asker = askers.get(sessionId);
        if (!asker)
          log(`refused "${title}": nobody can answer (no turn running)`);
        else if (!allow)
          log(`refused "${title}": the agent offered no "allow once"`);
        const yes =
          asker && allow
            ? await asker.ask(describeAction(title, home()))
            : false;
        if (yes && allow)
          return { outcome: { outcome: "selected", optionId: allow.optionId } };
        // ACP: after session/cancel, pending permission requests are answered "cancelled".
        if (asker?.signal.aborted) return { outcome: { outcome: "cancelled" } };
        return reject
          ? { outcome: { outcome: "selected", optionId: reject.optionId } }
          : { outcome: { outcome: "cancelled" } };
      })
      .onNotification(acp.methods.client.session.update, (ctx) =>
        listeners.get(ctx.params.sessionId)?.(ctx.params.update)
      )
      .connect(
        acp.ndJsonStream(
          Writable.toWeb(proc.stdin),
          Readable.toWeb(proc.stdout) as ReadableStream<Uint8Array>
        )
      );
    const stopped = new Promise<never>((_, reject) => {
      proc.on("error", (error: NodeJS.ErrnoException) => {
        failure =
          error.code === "ENOENT"
            ? new Error(
                `${program} not found: install it, or fix "command" in the config`
              )
            : error;
      });
      proc.on("close", (code) => {
        failure ??= new Error(
          `the agent stopped (exit ${code ?? "?"})${stderr.trim() ? `: ${stderr.trim()}` : ""}`
        );
        connection.close(failure);
        if (running?.child === proc) running = undefined;
        if (child === proc) {
          starting = undefined;
          sessions.clear();
        }
        for (const listener of listeners.values())
          listener({ sessionUpdate: "__stopped" } as never);
        reject(failure);
      });
    });
    stopped.catch(() => undefined);
    const explain = async (error: unknown): Promise<Error> => {
      await Promise.race([
        stopped.catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
      return failure ?? friendly(error, program);
    };
    const ready = connection.agent
      .request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: NO_ACCESS,
      })
      .then((init) => {
        const agent: Agent = {
          child: proc,
          context: connection.agent,
          canAttach: Boolean(
            init.agentCapabilities?.sessionCapabilities?.additionalDirectories
          ),
          failure: () => failure ?? new Error("the agent stopped"),
          explain,
        };
        running = agent;
        return agent;
      })
      .catch(async (error: unknown) => {
        proc.kill();
        throw await explain(error);
      });
    return Promise.race([ready, stopped]);
  }

  function start(): Promise<Agent> {
    starting ??= launch();
    return starting;
  }

  // The session and the process it lives in travel together, so a turn never sends a session id
  // to a restarted agent that doesn't know it.
  function session(sessionKey: string): Promise<Session> {
    let id = sessions.get(sessionKey);
    if (!id) {
      id = start().then(async (agent): Promise<Session> => {
        if (options.projects?.length && !agent.canAttach)
          throw new Error(
            `${program} can't open extra folders: remove "projects" from the config`
          );
        try {
          const created = await agent.context.request(
            acp.methods.agent.session.new,
            {
              cwd: home(),
              mcpServers: options.mcpServers ?? [],
              ...(options.sessionMeta ? { _meta: options.sessionMeta } : {}),
              ...(options.projects?.length
                ? {
                    additionalDirectories: options.projects.map((path) =>
                      realFolder(path, "the project folder")
                    ),
                  }
                : {}),
            }
          );
          const mode = options.mode;
          if (mode && created.modes?.currentModeId !== mode) {
            const offered = created.modes?.availableModes.map((m) => m.id);
            if (!offered?.includes(mode))
              throw new Error(
                `${program} has no mode "${mode}" (it offers ${offered?.join(", ") || "none"})`
              );
            await agent.context.request(acp.methods.agent.session.setMode, {
              sessionId: created.sessionId,
              modeId: mode,
            });
          }
          return { agent, sessionId: created.sessionId };
        } catch (error) {
          throw await agent.explain(error);
        }
      });
      const pending = id;
      pending.catch(() => {
        if (sessions.get(sessionKey) === pending) sessions.delete(sessionKey);
      });
      sessions.set(sessionKey, pending);
    }
    return id;
  }

  return {
    name: options.name ?? "acp",
    warm: (sessionKey) =>
      void session(sessionKey).catch((error: Error) =>
        log(`agent not ready: ${error.message}`)
      ),
    dispose: () => child?.kill(),
    async *reply({ sessionKey, text, signal, ask }) {
      const { agent, sessionId } = await session(sessionKey);
      // Cancelled while the agent was starting: never send the question at all.
      if (signal.aborted) return;
      const items = queue();
      let wroteText = false;
      let breakLine = false;
      const own = (update: acp.SessionUpdate) => {
        // A cancelled turn's late words must not leak into the next one.
        if (signal.aborted) return;
        if ((update.sessionUpdate as string) === "__stopped")
          items.push({ error: agent.failure() });
        else if (
          update.sessionUpdate === "agent_message_chunk" &&
          update.content.type === "text"
        ) {
          // Text before and after a tool call arrives with nothing between it.
          if (breakLine) items.push({ text: "\n" });
          breakLine = false;
          wroteText = true;
          items.push({ text: update.content.text });
        } else if (
          update.sessionUpdate === "tool_call" ||
          update.sessionUpdate === "tool_call_update"
        )
          breakLine = wroteText;
      };
      listeners.set(sessionId, own);
      const asker = ask ? { ask, signal } : undefined;
      if (asker) askers.set(sessionId, asker);
      const onAbort = () => {
        items.push({ end: true });
        void agent.context
          .notify(acp.methods.agent.session.cancel, { sessionId })
          .catch(() => undefined);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      agent.context
        .request(acp.methods.agent.session.prompt, {
          sessionId,
          prompt: [{ type: "text", text }],
        })
        .then(
          () => items.push({ end: true }),
          async (error: unknown) =>
            items.push({ error: await agent.explain(error) })
        );
      try {
        for (;;) {
          const item = await items.next();
          if (signal.aborted) return;
          if ("end" in item) return;
          if ("error" in item) throw item.error;
          yield item.text;
        }
      } finally {
        signal.removeEventListener("abort", onAbort);
        // Only our own listener: a newer turn on the same session may already have replaced it.
        if (listeners.get(sessionId) === own) listeners.delete(sessionId);
        if (asker && askers.get(sessionId) === asker) askers.delete(sessionId);
      }
    },
  };
}

export { createAcpAgent, describeAction };
export type { AcpAgentOptions };
