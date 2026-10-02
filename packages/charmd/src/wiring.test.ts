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
    expect(createAgentFromConfig(config).name).toBe("hermes");
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
