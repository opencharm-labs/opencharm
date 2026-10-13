import { describe, expect, it } from "vitest";

import { parseConfig } from "./config/config";
import {
  charmToolsServers,
  createAgentFromConfig,
  createVoiceFromConfig,
} from "./wiring";

describe("wiring", () => {
  it("builds the configured voice and agent", () => {
    const config = parseConfig({
      voice: { provider: "local" },
      agent: { adapter: "hermes", apiKey: "k" },
    });
    expect(createVoiceFromConfig(config).name).toBe("local");
    expect(
      createVoiceFromConfig(
        parseConfig({
          voice: {
            listen: { provider: "local" },
            speak: { provider: "microsoft" },
            language: "it",
          },
        })
      )
    ).toMatchObject({ name: "local+microsoft", language: "it" });
    expect(createAgentFromConfig(config).name).toBe("hermes");
  });

  it("finds the ElevenLabs key in ELEVENLABS_API_KEY or the variable the config names", () => {
    const eleven = (voice: object) =>
      createVoiceFromConfig(
        parseConfig({
          voice: {
            listen: { provider: "elevenlabs", ...voice },
            speak: { provider: "elevenlabs", ...voice },
          },
        })
      );
    const saved = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    try {
      expect(() => eleven({})).toThrow(/ELEVENLABS_API_KEY/);
      process.env.ELEVENLABS_API_KEY = "from-env";
      expect(eleven({}).name).toBe("elevenlabs");
      // ElevenLabs hears the hold as it goes; the voices that can't, don't claim to.
      expect(eleven({}).live).toBeTypeOf("function");
      expect(createVoiceFromConfig(parseConfig({})).live).toBeUndefined();
      delete process.env.ELEVENLABS_API_KEY;
      process.env.OPENCHARM_TEST_KEY = "named";
      expect(eleven({ apiKeyEnv: "OPENCHARM_TEST_KEY" }).name).toBe(
        "elevenlabs"
      );
    } finally {
      delete process.env.OPENCHARM_TEST_KEY;
      if (saved === undefined) delete process.env.ELEVENLABS_API_KEY;
      else process.env.ELEVENLABS_API_KEY = saved;
    }
  });

  it("reads the agent key from the environment when the config has none", () => {
    process.env.OPENCHARM_TEST_KEY = "from-env";
    const config = parseConfig({
      agent: { adapter: "hermes", apiKeyEnv: "OPENCHARM_TEST_KEY" },
    });
    expect(createAgentFromConfig(config).name).toBe("hermes");
    delete process.env.OPENCHARM_TEST_KEY;
  });

  it("gives ACP agents the charm's tools when the CLI says how to start them, unless turned off", () => {
    const tools = {
      command: "/usr/bin/node",
      args: ["/opt/opencharm/main.mjs", "mcp"],
    };
    const on = parseConfig({
      agent: { adapter: "acp", agent: "claude" },
      adminSocket: "/tmp/oc.sock",
    });
    expect(charmToolsServers(on, tools)).toEqual([
      {
        name: "charm",
        command: "/usr/bin/node",
        args: ["/opt/opencharm/main.mjs", "mcp", "--socket", "/tmp/oc.sock"],
        env: [],
      },
    ]);
    // Hosted by something else (tests, another program): nobody said how, so no tools.
    expect(charmToolsServers(on)).toEqual([]);
    const off = parseConfig({
      agent: { adapter: "acp", agent: "claude", charmTools: false },
    });
    expect(charmToolsServers(off, tools)).toEqual([]);
  });
});
