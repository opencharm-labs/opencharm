import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";

import { flagValue } from "../args";
import type { CliContext } from "../context";

type SetupStep =
  | { kind: "user"; name: string; home: string }
  | { kind: "dir"; path: string; mode: number; owner: string; group: string }
  | {
      kind: "file";
      path: string;
      mode: number;
      owner: string;
      group: string;
      content: string;
    }
  | { kind: "run"; command: string[] };
type SetupOptions = {
  domain: string;
  node: string;
  cli: string;
  exists: (path: string) => boolean;
};

const USER = "charmd";
const STATE_DIR = "/var/lib/charmd";
const CONFIG_DIR = "/etc/opencharm";
const CONFIG = `${CONFIG_DIR}/charmd.json`;
const ENV = `${CONFIG_DIR}/charmd.env`;
const UNIT = "/etc/systemd/system/charmd.service";
// A public host name (at least one dot, not an IP): Caddy needs one to get a certificate.
const HOST =
  /^(?=.{1,253}$)(?!.*\.\d+$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
// ProtectHome=yes hides these from the service.
const HIDDEN = /^\/(home|root)(\/|$)/;

function unit(node: string, cli: string): string {
  return `# Installed by opencharm setup. charmd, the charm daemon, runs as its own user so the agent
# running on this machine can't read its tokens, PINs or keys.
[Unit]
Description=charmd, the OpenCharm charm daemon
After=network-online.target
Wants=network-online.target

[Service]
User=${USER}
Group=${USER}
EnvironmentFile=${ENV}
ExecStart=${node} ${cli} serve --config ${CONFIG}
Restart=on-failure
RestartSec=2
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ReadWritePaths=${STATE_DIR}
CapabilityBoundingSet=
AmbientCapabilities=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
SystemCallArchitectures=native
UMask=0077

[Install]
WantedBy=multi-user.target
`;
}

// Every change setup makes, as data: printed before it runs, and tested without root.
function planSetup({ domain, node, cli, exists }: SetupOptions): SetupStep[] {
  if (!HOST.test(domain))
    throw new Error(
      `"${domain}" is not a domain name (e.g. charm.example.com)`
    );
  for (const path of [node, cli])
    if (HIDDEN.test(path))
      throw new Error(
        `${path} is under /home or /root, which the hardened service can't see; install Node system-wide (e.g. NodeSource) and run: sudo npm install -g opencharm`
      );
  const config = {
    listen: { host: "127.0.0.1", port: 8787 },
    statePath: `${STATE_DIR}/state.json`,
    publicUrl: `wss://${domain}/charm`,
    voice: { provider: "openai" },
    agent: { adapter: "hermes" },
    logTranscripts: false,
  };
  const env = `# Keys for charmd (read by systemd; readable by root and charmd only).
OPENAI_API_KEY=
# Hermes' API server key (API_SERVER_KEY in Hermes' own .env).
API_SERVER_KEY=
`;
  const steps: SetupStep[] = [
    { kind: "user", name: USER, home: STATE_DIR },
    { kind: "dir", path: STATE_DIR, mode: 0o700, owner: USER, group: USER },
    { kind: "dir", path: CONFIG_DIR, mode: 0o750, owner: "root", group: USER },
  ];
  if (!exists(CONFIG)) {
    steps.push({
      kind: "file",
      path: CONFIG,
      mode: 0o640,
      owner: "root",
      group: USER,
      content: `${JSON.stringify(config, null, 2)}\n`,
    });
  }
  if (!exists(ENV))
    steps.push({
      kind: "file",
      path: ENV,
      mode: 0o640,
      owner: "root",
      group: USER,
      content: env,
    });
  steps.push(
    {
      kind: "file",
      path: UNIT,
      mode: 0o644,
      owner: "root",
      group: "root",
      content: unit(node, cli),
    },
    { kind: "run", command: ["systemctl", "daemon-reload"] },
    // Not --now: without keys charmd would crash-loop until systemd gives up on it.
    { kind: "run", command: ["systemctl", "enable", "charmd"] }
  );
  return steps;
}

function describe(step: SetupStep): string {
  switch (step.kind) {
    case "user":
      return `create system user ${step.name} (no login, home ${step.home})`;
    case "dir":
      return `folder ${step.path} ${step.mode.toString(8)} ${step.owner}:${step.group}`;
    case "file":
      return `file ${step.path} ${step.mode.toString(8)} ${step.owner}:${step.group}`;
    case "run":
      return `run ${step.command.join(" ")}`;
  }
}

function run(command: string[]): void {
  const [program, ...args] = command;
  const result = spawnSync(program ?? "", args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command.join(" ")} failed`);
}

function apply(step: SetupStep): void {
  switch (step.kind) {
    case "user":
      if (spawnSync("id", ["-u", step.name]).status !== 0) {
        run([
          "useradd",
          "--system",
          "--home-dir",
          step.home,
          "--no-create-home",
          "--shell",
          "/usr/sbin/nologin",
          step.name,
        ]);
      }
      return;
    case "dir":
      mkdirSync(step.path, { recursive: true });
      chmodSync(step.path, step.mode);
      run(["chown", `${step.owner}:${step.group}`, step.path]);
      return;
    case "file":
      writeFileSync(step.path, step.content, { mode: step.mode });
      chmodSync(step.path, step.mode);
      run(["chown", `${step.owner}:${step.group}`, step.path]);
      return;
    case "run":
      run(step.command);
  }
}

function runSetup(ctx: CliContext, args: readonly string[]): void {
  const fail = (message: string) => {
    ctx.err.write(`${message}\n`);
    process.exitCode = 1;
  };
  const domain = flagValue(args, "--domain");
  if (!domain)
    return fail(
      "Usage: sudo opencharm setup --domain charm.example.com [--dry-run]"
    );
  const dryRun = args.includes("--dry-run");
  let steps: SetupStep[];
  try {
    steps = planSetup({
      domain,
      node: process.execPath,
      cli: realpathSync(fileURLToPath(import.meta.url)),
      exists: existsSync,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  ctx.out.write(
    `opencharm setup will:\n${steps.map((s) => `  - ${describe(s)}`).join("\n")}\n\n`
  );
  if (!dryRun) {
    if (process.platform !== "linux")
      return fail(
        "setup installs a systemd service; run it on the Linux machine next to your agent (try --dry-run here)."
      );
    if (process.getuid?.() !== 0)
      return fail("setup changes system folders and users; run it with sudo.");
    try {
      for (const step of steps) apply(step);
    } catch (error) {
      return fail(
        `setup stopped: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  ctx.out.write(`${dryRun ? "Dry run: nothing changed.\n\n" : ""}Next:
  1. Put your keys in ${ENV}, then: sudo systemctl start charmd
  2. Caddy (/etc/caddy/Caddyfile), then: sudo systemctl reload caddy

     ${domain} {
       reverse_proxy 127.0.0.1:8787
     }

  3. Pair a charm: sudo -u ${USER} opencharm pair <code> --config ${CONFIG}
  4. Check: sudo -u ${USER} opencharm status --config ${CONFIG}
`);
}

export { planSetup, runSetup };
export type { SetupOptions, SetupStep };
