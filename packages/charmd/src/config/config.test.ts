import { mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfig, parseConfig } from "./config";

function tempFile(content: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "oc-config-"));
  const file = join(dir, "opencharm.json");
  writeFileSync(file, JSON.stringify(content));
  return file;
}

describe("parseConfig", () => {
  it("fills laptop-friendly defaults", () => {
    const config = parseConfig({});
    expect(config.listen).toEqual({ host: "127.0.0.1", port: 8787 });
    expect(config.statePath).toBe(join(homedir(), ".opencharm", "state.json"));
    expect(config.maxConnections).toBe(16);
    expect(config.allowInsecureRemote).toBe(false);
  });

  it("names the field that is wrong", () => {
    expect(() => parseConfig({ listen: { port: "eighty" } })).toThrow(
      /listen\.port/
    );
  });

  it("refuses a non-loopback address without allowInsecureRemote", () => {
    expect(() => parseConfig({ listen: { host: "0.0.0.0" } })).toThrow(
      /allowInsecureRemote/
    );
  });

  it("accepts a non-loopback address when explicitly allowed", () => {
    expect(
      parseConfig({ listen: { host: "0.0.0.0" }, allowInsecureRemote: true })
        .listen.host
    ).toBe("0.0.0.0");
  });

  it("puts the admin socket next to the state file by default", () => {
    const config = parseConfig({ statePath: "/var/lib/charmd/state.json" });
    expect(config.adminSocket).toMatch(/charmd\.sock$|opencharm-charmd/);
  });
});

describe("loadConfig", () => {
  it("reads an explicit file and resolves relative paths against it", () => {
    const file = tempFile({ statePath: "state/state.json" });
    const config = loadConfig(file);
    expect(config.statePath).toBe(join(file, "..", "state", "state.json"));
  });

  it("uses defaults when no file exists", () => {
    const config = loadConfig(undefined, {
      searchPaths: ["/nope/opencharm.json"],
    });
    expect(config.listen.port).toBe(8787);
  });

  it("fails clearly when an explicit file is missing", () => {
    expect(() => loadConfig("/nope/opencharm.json")).toThrow(/not found/);
  });
});

describe("voice and agent config", () => {
  it("defaults to the fake voice and fake agent, so a fresh charmd runs with no keys", () => {
    const config = parseConfig({});
    expect(config.voice).toEqual({ provider: "fake" });
    expect(config.agent).toMatchObject({ adapter: "fake" });
    expect(config.logTranscripts).toBe(false);
  });

  it("runs a known ACP agent by name, with its adapter pinned, in the config's folder", () => {
    const config = parseConfig(
      { agent: { adapter: "acp", agent: "claude" } },
      "/home/me/charm"
    );
    expect(config.agent).toEqual({
      adapter: "acp",
      name: "claude",
      command: [
        "npx",
        "-y",
        expect.stringMatching(
          /^@agentclientprotocol\/claude-agent-acp@\d+\.\d+\.\d+$/
        ),
      ],
      cwd: "/home/me/charm",
      // Only the workspace's own Claude Code settings: none of the user's plugins, hooks or MCP servers.
      sessionMeta: {
        claudeCode: {
          options: {
            settingSources: ["project", "local"],
            allowedTools: ["mcp__charm"],
          },
        },
      },
      // Claude Code ignores a folder's own escalating defaultMode until the folder is trusted.
      mode: "acceptEdits",
      // Nor the user's claude.ai connectors (Gmail, Drive…): only the workspace's own tools.
      env: { ENABLE_CLAUDEAI_MCP_SERVERS: "0" },
      charmTools: true,
    });
  });

  it("runs any ACP agent from its command", () => {
    const config = parseConfig(
      {
        agent: {
          adapter: "acp",
          command: ["my-agent", "--acp"],
          cwd: "/srv/a",
        },
      },
      "/home/me/charm"
    );
    expect(config.agent).toMatchObject({
      name: "acp",
      command: ["my-agent", "--acp"],
      cwd: "/srv/a",
    });
  });

  it("needs exactly one of agent or command for ACP", () => {
    expect(() => parseConfig({ agent: { adapter: "acp" } })).toThrow(
      /agent.*command/
    );
    expect(() =>
      parseConfig({
        agent: { adapter: "acp", agent: "codex", command: ["x"] },
      })
    ).toThrow(/agent.*command/);
  });

  it("refuses an ACP agent it doesn't know", () => {
    expect(() =>
      parseConfig({ agent: { adapter: "acp", agent: "clippy" } })
    ).toThrow(/agent\.agent/);
  });

  it("resolves project folders against the config file and the home folder", () => {
    const config = parseConfig(
      {
        agent: {
          adapter: "acp",
          agent: "claude",
          projects: ["../app", "~/code/site"],
        },
      },
      "/home/me/charm"
    );
    expect(config.agent).toMatchObject({
      projects: ["/home/me/app", join(homedir(), "code/site")],
    });
  });

  it("requires a base URL for OpenAI-compatible agents", () => {
    expect(() =>
      parseConfig({ agent: { adapter: "openai-compatible", model: "m" } })
    ).toThrow(/agent\.baseUrl/);
  });

  it("fills Hermes defaults (localhost:8642, model hermes-agent)", () => {
    expect(parseConfig({ agent: { adapter: "hermes" } }).agent).toMatchObject({
      baseUrl: "http://127.0.0.1:8642/v1",
      model: "hermes-agent",
    });
  });

  it("turns an OpenClaw agent id into its model name", () => {
    expect(
      parseConfig({
        agent: {
          adapter: "openclaw",
          baseUrl: "http://127.0.0.1:18789/v1",
          agentId: "main",
        },
      }).agent
    ).toMatchObject({ model: "openclaw:main" });
  });
});

describe("the charm block (its identity)", () => {
  it("defaults to a white charm that sleeps after 4 minutes, with full motion, that the agent may restyle", () => {
    expect(parseConfig({}).charm).toEqual({
      colour: "white",
      sleepAfterMinutes: 4,
      motion: "full",
      agentCanChangeLook: true,
    });
  });

  it("accepts a name, an identity colour, a greeting, a sleep delay and calm motion", () => {
    const charm = {
      name: "Momo",
      colour: "lilac",
      greeting: "Hey, it's Momo.",
      sleepAfterMinutes: 0,
      motion: "calm",
      agentCanChangeLook: false,
    };
    expect(parseConfig({ charm }).charm).toEqual(charm);
  });

  it.each([
    [{ name: "Thirteen char" }, /charm\.name: at most 12 characters/],
    [{ name: "" }, /charm\.name/],
    [
      { colour: "orange" },
      /charm\.colour: .*white, cobalt, lime, lilac, sun, coal/,
    ],
    [{ greeting: "x".repeat(41) }, /charm\.greeting: at most 40 bytes/],
    [{ sleepAfterMinutes: 1441 }, /charm\.sleepAfterMinutes/],
    [{ motion: "wild" }, /charm\.motion/],
    [{ face: "custom" }, /charm/],
  ])("refuses %j with a clear message", (charm, message) => {
    expect(() => parseConfig({ charm })).toThrow(message);
  });
});
