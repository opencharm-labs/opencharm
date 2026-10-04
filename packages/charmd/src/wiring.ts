import type { McpServer } from "@agentclientprotocol/sdk";

import { createAcpAgent } from "./agent/acp";
import { createFakeAgent } from "./agent/fake";
import { createHermesAgent } from "./agent/hermes";
import { createOpenAiCompatibleAgent } from "./agent/openai-compatible";
import type { AgentAdapter } from "./agent/types";
import type { CharmdConfig, ListenConfig, SpeakConfig } from "./config/config";
import { createFakeVoice } from "./voice/fake";
import { createLocalVoice } from "./voice/local";
import { createMicrosoftSpeaker } from "./voice/microsoft";
import { createOpenAiVoice } from "./voice/openai";
import {
  createParakeetListener,
  createSupertonicSpeaker,
} from "./voice/sherpa";
import { speakWithFallback } from "./voice/speak";
import type { Listener, Speaker, VoiceProvider } from "./voice/types";

function key(
  config: { apiKey?: string; apiKeyEnv?: string },
  fallbackEnv?: string
): string | undefined {
  const env = config.apiKeyEnv ?? fallbackEnv;
  return config.apiKey ?? (env ? process.env[env] : undefined);
}

function createListener(config: ListenConfig): Listener {
  switch (config.provider) {
    case "fake":
      return createFakeVoice(config);
    case "local":
      return createParakeetListener();
    case "whisper":
      return createLocalVoice({
        ...(config.model ? { whisperModel: config.model } : {}),
        ...(config.command ? { whisperCommand: config.command } : {}),
      });
    case "openai":
      return createOpenAiVoice({
        ...config,
        apiKey: key(config, "OPENAI_API_KEY"),
        ...(config.model ? { sttModel: config.model } : {}),
      });
  }
}

function createSpeaker(config: SpeakConfig): Speaker {
  switch (config.provider) {
    case "fake":
      return createFakeVoice();
    case "microsoft":
      return createMicrosoftSpeaker(
        config.voices ? { voices: config.voices } : {}
      );
    case "local":
      return createSupertonicSpeaker(
        config.speaker === undefined ? {} : { speaker: config.speaker }
      );
    case "system":
      return {
        ...createLocalVoice(config.voice ? { sayVoice: config.voice } : {}),
        name: "system",
        onDevice: true,
      };
    case "openai":
      return createOpenAiVoice({
        ...config,
        apiKey: key(config, "OPENAI_API_KEY"),
        ...(config.model ? { ttsModel: config.model } : {}),
      });
  }
}

// The chosen voice, then for Microsoft's unofficial one the local voice, then macOS's own: a reply
// is never silent because a service failed or a model is still downloading. A paid voice with your
// key only falls back to macOS's, so it never downloads a model you didn't ask for.
function speakerChain(config: SpeakConfig): Speaker {
  if (config.provider === "fake" || config.provider === "system")
    return createSpeaker(config);
  const chain = [createSpeaker(config)];
  if (config.provider === "microsoft") chain.push(createSupertonicSpeaker());
  if (process.platform === "darwin")
    chain.push(createSpeaker({ provider: "system" }));
  return speakWithFallback(chain);
}

function createVoiceFromConfig(config: CharmdConfig): VoiceProvider {
  const listener = createListener(config.voice.listen);
  const speaker = speakerChain(config.voice.speak);
  return {
    name:
      listener.name === speaker.name
        ? listener.name
        : `${listener.name}+${speaker.name}`,
    transcribe: listener.transcribe,
    synthesize: speaker.synthesize,
    ...(speaker.stream ? { stream: speaker.stream } : {}),
    language: config.voice.language,
    warm: async () => {
      await Promise.allSettled([listener.warm?.(), speaker.warm?.()]);
    },
  };
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
