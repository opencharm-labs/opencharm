import { existsSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { type AcpAgentOptions, createAcpAgent, describeAction } from "./acp";
import type { AgentAdapter } from "./types";

type Logged = { pid: number; method: string; params: Record<string, unknown> };

const FAKE = fileURLToPath(
  new URL("./fixtures/fake-acp-agent.mjs", import.meta.url)
);

let agent: AgentAdapter | undefined;

afterEach(() => {
  agent?.dispose?.();
  agent = undefined;
});

// These wait for a line in the log a real child process (the fake agent) writes: its start or its
// next write can take seconds on a busy machine, running every workspace's tests at once, so the
// polls get 10 s and their tests 15 s (Vitest's defaults are 1 s and 5 s). A passing poll still
// returns as soon as the line appears.
const PROCESS = { timeout: 10_000 };
const SLOW = 15_000;

function setup(
  env: Record<string, string> = {},
  options: Partial<AcpAgentOptions> = {}
) {
  const dir = mkdtempSync(join(tmpdir(), "oc-acp-"));
  const logPath = join(dir, "log.jsonl");
  const notes: string[] = [];
  const created = createAcpAgent({
    command: [process.execPath, FAKE],
    cwd: dir,
    env: { FAKE_ACP_LOG: logPath, ...env },
    log: (line) => notes.push(line),
    ...options,
  });
  agent = created;
  const logged = (): Logged[] =>
    existsSync(logPath)
      ? readFileSync(logPath, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as Logged)
      : [];
  return { agent: created, dir, logged, notes };
}

async function collect(
  adapter: AgentAdapter,
  text: string,
  sessionKey = "opencharm-c_1",
  signal = new AbortController().signal
): Promise<string> {
  let out = "";
  for await (const chunk of adapter.reply({ sessionKey, text, signal }))
    out += chunk;
  return out;
}

describe("acp agent", () => {
  it("streams the agent's reply text", async () => {
    const { agent } = setup();
    expect(await collect(agent, "hello")).toBe("You said: hello.");
  });

  it("starts the agent in its workspace with no file or terminal access of its own", async () => {
    const { agent, dir, logged } = setup();
    await collect(agent, "hello");
    const init = logged().find((l) => l.method === "initialize");
    expect(init?.params.clientCapabilities).toMatchObject({
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
    });
    const session = logged().find((l) => l.method === "session/new");
    expect(session?.params).toMatchObject({
      cwd: realpathSync(dir),
      mcpServers: [],
    });
  });

  it("passes agent-specific session options", async () => {
    const meta = { claudeCode: { options: { settingSources: ["project"] } } };
    const { agent, logged } = setup({}, { sessionMeta: meta });
    await collect(agent, "hello");
    expect(
      logged().find((l) => l.method === "session/new")?.params._meta
    ).toEqual(meta);
  });

  it("switches the session to the configured mode", async () => {
    const { agent, logged } = setup({}, { mode: "acceptEdits" });
    await collect(agent, "hello");
    expect(
      logged().find((l) => l.method === "session/set_mode")?.params
    ).toEqual({ sessionId: "s1", modeId: "acceptEdits" });
  });

  it("refuses a mode the agent doesn't offer", async () => {
    const { agent } = setup({}, { mode: "yolo" });
    await expect(collect(agent, "hello")).rejects.toThrow(
      /mode "yolo".*default, acceptEdits, auto/
    );
  });

  // Auto mode can be off for a plan or by policy; the agent's own mode still guards it.
  it("keeps answering in the agent's own mode when it refuses the configured one", async () => {
    const { agent, notes } = setup(
      { FAKE_ACP_REFUSE_MODE: "auto" },
      { mode: "auto" }
    );
    expect(await collect(agent, "hello")).toBe("You said: hello.");
    expect(notes.join("\n")).toMatch(
      /mode "auto" refused.*unavailable for your plan/
    );
  });

  it("leaves the mode alone when none is configured", async () => {
    const { agent, logged } = setup();
    await collect(agent, "hello");
    expect(logged().some((l) => l.method === "session/set_mode")).toBe(false);
  });

  it("hands the agent the charm's own tools as an MCP server", async () => {
    const charm = {
      name: "charm",
      command: "/usr/bin/node",
      args: ["/opt/opencharm/dist/main.mjs", "mcp", "--socket", "/tmp/c.sock"],
      env: [],
    };
    const { agent, logged } = setup({}, { mcpServers: [charm] });
    await collect(agent, "hello");
    expect(
      logged().find((l) => l.method === "session/new")?.params.mcpServers
    ).toEqual([charm]);
  });

  it("keeps one session per charm, and one process for all charms", async () => {
    const { agent, logged } = setup();
    await collect(agent, "one", "opencharm-a");
    await collect(agent, "two", "opencharm-a");
    await collect(agent, "three", "opencharm-b");
    const prompts = logged().filter((l) => l.method === "session/prompt");
    expect(prompts.map((p) => p.params.sessionId)).toEqual(["s1", "s1", "s2"]);
    expect(new Set(logged().map((l) => l.pid)).size).toBe(1);
  });

  it(
    "warms up the session before the first question",
    async () => {
      const { agent, logged } = setup();
      agent.warm?.("opencharm-c_1");
      await expect
        .poll(() => logged().some((l) => l.method === "session/new"), PROCESS)
        .toBe(true);
    },
    SLOW
  );

  it("breaks the line where the agent stopped to use a tool", async () => {
    const { agent } = setup();
    expect(await collect(agent, "use a tool")).toBe(
      "Let me check.\nIt's sunny."
    );
  });

  it(
    "cancels the turn when the user presses the key, and stays usable",
    async () => {
      const { agent, logged } = setup();
      const stop = new AbortController();
      const chunks: string[] = [];
      for await (const chunk of agent.reply({
        sessionKey: "opencharm-c_1",
        text: "slow",
        signal: stop.signal,
      })) {
        chunks.push(chunk);
        stop.abort();
      }
      expect(chunks).toEqual(["Thinking"]);
      await expect
        .poll(
          () => logged().some((l) => l.method === "session/cancel"),
          PROCESS
        )
        .toBe(true);
      expect(await collect(agent, "again")).toBe("You said: again.");
    },
    SLOW
  );

  it("never sends a question the user already cancelled", async () => {
    const { agent, logged } = setup();
    const stop = new AbortController();
    stop.abort();
    expect(await collect(agent, "hello", "opencharm-c_1", stop.signal)).toBe(
      ""
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(logged().some((l) => l.method === "session/prompt")).toBe(false);
  });

  it("answers a new question asked while the cancelled one is still winding down", async () => {
    const { agent } = setup();
    const stop = new AbortController();
    const old = collect(agent, "slow", "opencharm-c_1", stop.signal);
    await new Promise((resolve) => setTimeout(resolve, 300));
    stop.abort();
    const fresh = await collect(agent, "again");
    await old;
    expect(fresh).toBe("You said: again.");
  });

  it("stops an agent that is still starting when charmd stops", async () => {
    const { agent, logged } = setup();
    agent.warm?.("opencharm-c_1");
    agent.dispose?.();
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(logged().some((l) => l.method === "session/new")).toBe(false);
  });

  it("is named after the agent, so failures can say which one", () => {
    const { agent } = setup({}, { name: "claude" });
    expect(agent.name).toBe("claude");
  });

  it(
    "asks the person on the charm, and allows once on yes",
    async () => {
      const { agent, logged } = setup();
      const asked: string[] = [];
      let out = "";
      for await (const chunk of agent.reply({
        sessionKey: "opencharm-c_1",
        text: "permission please",
        signal: new AbortController().signal,
        ask: (action) => {
          asked.push(action);
          return Promise.resolve(true);
        },
      }))
        out += chunk;
      expect(asked).toEqual(["edit AGENTS.md"]);
      expect(out).toBe("Done.");
      expect(
        logged().find((l) => l.method === "permission-answer")?.params
      ).toEqual({ outcome: { outcome: "selected", optionId: "yes" } });
    },
    SLOW
  );

  it("answers 'cancelled' when the turn is cancelled while the question waits", async () => {
    const { agent, logged } = setup();
    const stop = new AbortController();
    const chunks: string[] = [];
    for await (const chunk of agent.reply({
      sessionKey: "opencharm-c_1",
      text: "permission please",
      signal: stop.signal,
      ask: () =>
        new Promise((resolve) => {
          stop.signal.addEventListener("abort", () => resolve(false));
          stop.abort();
        }),
    }))
      chunks.push(chunk);
    await expect
      .poll(
        () => logged().find((l) => l.method === "permission-answer")?.params,
        PROCESS
      )
      .toEqual({ outcome: { outcome: "cancelled" } });
  });

  it("refuses once when the person says no", async () => {
    const { agent } = setup();
    let out = "";
    for await (const chunk of agent.reply({
      sessionKey: "opencharm-c_1",
      text: "permission please",
      signal: new AbortController().signal,
      ask: () => Promise.resolve(false),
    }))
      out += chunk;
    expect(out).toBe("Not allowed.");
  });

  it("refuses permission requests nobody can answer, and says so in the log", async () => {
    const { agent, logged, notes } = setup();
    expect(await collect(agent, "permission please")).toBe("Not allowed.");
    expect(
      logged().find((l) => l.method === "permission-answer")?.params
    ).toEqual({ outcome: { outcome: "selected", optionId: "no" } });
    expect(notes.join("\n")).toMatch(/refused "Edit AGENTS.md"/);
  });

  it("reports the agent's error", async () => {
    const { agent } = setup();
    await expect(collect(agent, "fail")).rejects.toThrow(/model overloaded/);
  });

  it("starts the agent again after it crashes", async () => {
    const { agent, logged } = setup();
    await expect(collect(agent, "crash")).rejects.toThrow(/stopped/);
    expect(await collect(agent, "back")).toBe("You said: back.");
    expect(new Set(logged().map((l) => l.pid)).size).toBe(2);
  });

  it("says so when the workspace folder is missing", async () => {
    const { agent } = setup({}, { cwd: "/nope/workspace" });
    await expect(collect(agent, "hello")).rejects.toThrow(
      /\/nope\/workspace.*not found/
    );
  });

  it("says how to fix a missing command", async () => {
    const { agent } = setup({}, { command: ["/nope/claude-agent-acp"] });
    await expect(collect(agent, "hello")).rejects.toThrow(
      /claude-agent-acp.*not found/
    );
  });

  it("asks the user to log in when the agent needs it", async () => {
    const { agent } = setup({ FAKE_ACP_AUTH: "1" });
    await expect(collect(agent, "hello")).rejects.toThrow(/log in/i);
  });

  it("attaches project folders when the agent supports them", async () => {
    const project = mkdtempSync(join(tmpdir(), "oc-project-"));
    const { agent, logged } = setup(
      { FAKE_ACP_DIRS: "1" },
      { projects: [project] }
    );
    await collect(agent, "hello");
    expect(
      logged().find((l) => l.method === "session/new")?.params
        .additionalDirectories
    ).toEqual([realpathSync(project)]);
  });

  it("refuses project folders when the agent can't use them", async () => {
    const { agent } = setup({}, { projects: ["/code/app"] });
    await expect(collect(agent, "hello")).rejects.toThrow(/projects/);
  });
});

describe("describeAction", () => {
  it("reads like a short sentence, with paths relative to the workspace", () => {
    expect(describeAction("Write /w/me/charm/notes/x.md", "/w/me/charm")).toBe(
      "write notes/x.md"
    );
    expect(describeAction("Write /w/me/outside.txt", "/w/me/charm")).toBe(
      "write ../outside.txt"
    );
    expect(
      describeAction(`Read ${homedir()}/.ssh/id_ed25519`, "/w/me/charm")
    ).toBe("read ~/.ssh/id_ed25519");
    expect(describeAction("x".repeat(300), "/w").length).toBe(120);
    expect(describeAction("mcp__gmail__send_email", "/w")).toBe(
      "use the gmail tool send_email"
    );
  });
});
