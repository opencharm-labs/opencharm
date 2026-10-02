import { describe, expect, it } from "vitest";

import { type SetupStep, planSetup } from "./setup";

const OPTIONS = {
  domain: "charm.example.com",
  node: "/usr/bin/node",
  cli: "/usr/lib/node_modules/opencharm/dist/main.mjs",
  exists: () => false,
};

function file(steps: SetupStep[], path: string) {
  const step = steps.find((s) => s.kind === "file" && s.path === path);
  if (!step || step.kind !== "file")
    throw new Error(`no file step for ${path}`);
  return step;
}

describe("planSetup", () => {
  const steps = planSetup(OPTIONS);

  it("creates a system user with no login shell", () => {
    expect(steps[0]).toMatchObject({
      kind: "user",
      name: "charmd",
      home: "/var/lib/charmd",
    });
  });

  it("gives charmd a private state folder and a config folder the agent's user can't read", () => {
    expect(steps).toContainEqual(
      expect.objectContaining({
        kind: "dir",
        path: "/var/lib/charmd",
        mode: 0o700,
        owner: "charmd",
        group: "charmd",
      })
    );
    expect(steps).toContainEqual(
      expect.objectContaining({
        kind: "dir",
        path: "/etc/opencharm",
        mode: 0o750,
        owner: "root",
        group: "charmd",
      })
    );
  });

  it("writes a config without secrets, on loopback, pointing charms at wss://<domain>", () => {
    const config = file(steps, "/etc/opencharm/charmd.json");
    expect(config).toMatchObject({
      mode: 0o640,
      owner: "root",
      group: "charmd",
    });
    const parsed = JSON.parse(config.content) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      listen: { host: "127.0.0.1", port: 8787 },
      statePath: "/var/lib/charmd/state.json",
      publicUrl: "wss://charm.example.com/charm",
      voice: { provider: "openai" },
      agent: { adapter: "hermes" },
    });
    expect(config.content).not.toMatch(/sk-|apiKey"/);
  });

  it("keeps the keys in a separate env file for systemd, readable by charmd only", () => {
    const env = file(steps, "/etc/opencharm/charmd.env");
    expect(env).toMatchObject({ mode: 0o640, owner: "root", group: "charmd" });
    expect(env.content).toContain("OPENAI_API_KEY=");
    expect(env.content).toContain("API_SERVER_KEY=");
  });

  it("installs a hardened systemd service running as charmd", () => {
    const unit = file(steps, "/etc/systemd/system/charmd.service").content;
    for (const line of [
      "User=charmd",
      "EnvironmentFile=/etc/opencharm/charmd.env",
      "ExecStart=/usr/bin/node /usr/lib/node_modules/opencharm/dist/main.mjs serve --config /etc/opencharm/charmd.json",
      "NoNewPrivileges=yes",
      "ProtectSystem=strict",
      "ProtectHome=yes",
      "PrivateTmp=yes",
      "PrivateDevices=yes",
      "ReadWritePaths=/var/lib/charmd",
      "CapabilityBoundingSet=",
      "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6",
      "UMask=0077",
    ]) {
      expect(unit).toContain(line);
    }
  });

  it("enables the service but doesn't start it before the keys are in (it would crash-loop)", () => {
    expect(steps.at(-1)).toEqual({
      kind: "run",
      command: ["systemctl", "enable", "charmd"],
    });
  });

  it("never overwrites config or keys that already exist", () => {
    const again = planSetup({
      ...OPTIONS,
      exists: (p) => p.startsWith("/etc/opencharm/charmd."),
    });
    expect(
      again.some(
        (s) => s.kind === "file" && s.path === "/etc/opencharm/charmd.json"
      )
    ).toBe(false);
    expect(
      again.some(
        (s) => s.kind === "file" && s.path === "/etc/opencharm/charmd.env"
      )
    ).toBe(false);
  });

  it("refuses a domain that isn't a plain host name", () => {
    expect(() => planSetup({ ...OPTIONS, domain: "evil.com/x?y" })).toThrow(
      /domain/
    );
  });

  it("refuses names Caddy can't get a public certificate for", () => {
    for (const domain of ["localhost", "1.2.3.4", "charm"])
      expect(() => planSetup({ ...OPTIONS, domain })).toThrow(/domain/);
  });

  it("refuses a node or CLI under /home or /root, which the hardened service can't see", () => {
    expect(() =>
      planSetup({ ...OPTIONS, node: "/root/.nvm/versions/node/v24/bin/node" })
    ).toThrow(/home/);
    expect(() =>
      planSetup({
        ...OPTIONS,
        cli: "/home/me/.npm-global/lib/opencharm/dist/main.mjs",
      })
    ).toThrow(/home/);
  });
});
