// Known ACP agents by name. Adapters are pinned to exact versions: upgrading is a deliberate change.
// Checked 1 October 2026; the Gemini flag was `--experimental-acp` before Gemini CLI 0.33.
const ACP_AGENTS = {
  claude: {
    label: "Claude Code",
    command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp@0.84.0"],
    // The adapter loads the user's own Claude Code settings by default (plugins, hooks, MCP
    // servers): slower, and none of the voice agent's business. Only the workspace's apply.
    // The charm's own tools (opencharm mcp) need no permission; Claude Code's allow rules in
    // settings don't reach MCP tools through this adapter, its allowedTools option does.
    sessionMeta: {
      claudeCode: {
        options: {
          settingSources: ["project", "local"],
          allowedTools: ["mcp__charm"],
        },
      },
    },
    // Claude Code ignores a folder's own escalating `defaultMode` until the user trusts the folder,
    // so the workspace's "acceptEdits" is asked for explicitly; its deny rules still apply.
    mode: "acceptEdits",
    // Nor the user's claude.ai connectors (Gmail, Drive…), which project settings don't cover.
    env: { ENABLE_CLAUDEAI_MCP_SERVERS: "0" },
  },
  codex: {
    label: "Codex",
    command: ["npx", "-y", "@agentclientprotocol/codex-acp@2.1.0"],
  },
  gemini: { label: "Gemini CLI", command: ["gemini", "--acp"] },
  goose: { label: "goose", command: ["goose", "acp"] },
  hermes: { label: "Hermes", command: ["hermes", "acp"] },
  openclaw: { label: "OpenClaw", command: ["openclaw", "acp"] },
} as const;

type AcpAgentName = keyof typeof ACP_AGENTS;

const ACP_AGENT_NAMES = Object.keys(ACP_AGENTS) as [
  AcpAgentName,
  ...AcpAgentName[],
];

export { ACP_AGENTS, ACP_AGENT_NAMES };
export type { AcpAgentName };
