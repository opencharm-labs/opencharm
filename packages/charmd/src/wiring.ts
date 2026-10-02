import type { McpServer } from "@agentclientprotocol/sdk";

import { createAcpAgent } from "./agent/acp";
import { createFakeAgent } from "./agent/fake";
import { createHermesAgent } from "./agent/hermes";
import { createOpenAiCompatibleAgent } from "./agent/openai-compatible";
import type { AgentAdapter } from "./agent/types";
import type { CharmdConfig } from "./config/config";
import { createFakeVoice } from "./voice/fake";
import { createLocalVoice } from "./voice/local";
import { createOpenAiVoice } from "./voice/openai";
import type { VoiceProvider } from "./voice/types";

function key(
  config: { apiKey?: string; apiKeyEnv?: string },
  fallbackEnv?: string
): string | undefined {
  const env = config.apiKeyEnv ?? fallbackEnv;
  return config.apiKey ?? (env ? process.env[env] : undefined);
}

function createVoiceFromConfig(config: CharmdConfig): VoiceProvider {
  const voice = config.voice;
  switch (voice.provider) {
    case "fake":
      return createFakeVoice({ transcript: voice.transcript });
    case "local":
      return createLocalVoice(voice);
    case "openai":
      return createOpenAiVoice({
        ...voice,
        apiKey: key(voice, "OPENAI_API_KEY"),
      });
  }
}

type ToolsCommand = { command: string; args: string[] };

// The charm's tools for ACP agents: `opencharm mcp` on this charmd's admin socket. Only the CLI knows
// how to start itself, so it says (`opencharm serve`); hosted any other way, there are no tools.
function charmToolsServers(
  config: CharmdConfig,
  tools?: ToolsCommand
): McpServer[] {
  const agent = config.agent;
  if (agent.adapter !== "acp" || !agent.charmTools || !tools) return [];
  return [
    {
      name: "charm",
      command: tools.command,
      args: [...tools.args, "--socket", config.adminSocket],
      env: [],
    },
  ];
}

function createAgentFromConfig(
  config: CharmdConfig,
  log: (line: string) => void = () => undefined,
  tools?: ToolsCommand
): AgentAdapter {
  const agent = config.agent;
  switch (agent.adapter) {
    case "fake":
      return createFakeAgent();
    case "openai-compatible":
      return createOpenAiCompatibleAgent({ ...agent, apiKey: key(agent) });
    case "openclaw":
      return createOpenAiCompatibleAgent({
        ...agent,
        apiKey: key(agent, "OPENCLAW_GATEWAY_TOKEN"),
      });
    case "hermes":
      return createHermesAgent({
        ...agent,
        apiKey: key(agent, "API_SERVER_KEY"),
      });
    case "acp":
      return createAcpAgent({
        ...agent,
        log,
        mcpServers: charmToolsServers(config, tools),
      });
  }
}

export { charmToolsServers, createAgentFromConfig, createVoiceFromConfig };
export type { ToolsCommand };
