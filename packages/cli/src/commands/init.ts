import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { ACP_AGENT_NAMES } from "@opencharm-labs/charmd/acp-agents";
import { lookFields, readAgentName } from "@opencharm-labs/charmd/look";
import { z } from "zod";

import { firstPositional, flagValue } from "../args";
import type { CliContext } from "../context";

type InitOptions = {
  // A git URL or path; forks of the starter work too.
  from?: string;
  platform: NodeJS.Platform;
  agent?: string;
  // The charm's identity (spec 014), written to the charm block.
  name?: string;
  colour?: string;
};
type StarterConfig = {
  voice?: { provider?: string };
  agent?: { agent?: string };
  charm?: Record<string, unknown>;
};

const STARTER = "https://github.com/opencharm-labs/opencharm-starter.git";

// Checked before cloning, with charmd's own rules, so a bad flag leaves nothing behind.
function checkLook(options: InitOptions): Record<string, string> {
  const result = z
    .object({ name: lookFields.name, colour: lookFields.colour })
    .safeParse({ name: options.name, colour: options.colour });
  if (!result.success)
    throw new Error(
      result.error.issues
        .map((issue) => `--${issue.path.join(".")}: ${issue.message}`)
        .join("; ")
    );
  const { name, colour } = result.data;
  return { ...(name ? { name } : {}), ...(colour ? { colour } : {}) };
}

// The starter repo is the single source of truth for a workspace: init clones it (keeping it as the
// `upstream` remote, so fixes can be pulled later) and only fits opencharm.json to this machine.
function initWorkspace(target: string, options: InitOptions): void {
  const from = options.from ?? STARTER;
  const agent = options.agent ?? "claude";
  if (!(ACP_AGENT_NAMES as readonly string[]).includes(agent))
    throw new Error(
      `Unknown agent "${agent}": choose ${ACP_AGENT_NAMES.join(", ")}`
    );
  const look = checkLook(options);
  if (existsSync(target) && readdirSync(target).length > 0)
    throw new Error(`${target} is not empty; choose a new folder`);
  const clone = spawnSync(
    "git",
    ["clone", "--quiet", "--depth", "1", "--origin", "upstream", from, target],
    { encoding: "utf8" }
  );
  if (clone.error)
    throw new Error("git not found: install git, then run this again");
  if (clone.status !== 0)
    throw new Error(
      `Couldn't clone ${from}: ${clone.stderr.trim().split("\n").at(-1) ?? ""}`
    );

  const path = join(target, "opencharm.json");
  if (!existsSync(path))
    throw new Error(
      `${from} has no opencharm.json: is it an OpenCharm starter? (${target} was cloned; delete it)`
    );
  const config = JSON.parse(readFileSync(path, "utf8")) as StarterConfig;
  // Local speech needs macOS `say`; elsewhere start with the fake voice and switch to openai later.
  const voice = options.platform === "darwin" ? "local" : "fake";
  const hasLook = Object.keys(look).length > 0;
  if (
    config.voice?.provider === voice &&
    config.agent?.agent === agent &&
    !hasLook
  )
    return;
  config.voice = { ...config.voice, provider: voice };
  config.agent = { ...config.agent, agent };
  if (hasLook) config.charm = { ...config.charm, ...look };
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

function runInit(ctx: CliContext, args: readonly string[]): void {
  const dir = resolve(firstPositional(args) ?? "my-charm");
  const name = flagValue(args, "--name");
  try {
    initWorkspace(dir, {
      from: flagValue(args, "--from"),
      agent: flagValue(args, "--agent"),
      name,
      colour: flagValue(args, "--colour") ?? flagValue(args, "--color"),
      platform: process.platform,
    });
  } catch (error) {
    ctx.err.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
    return;
  }
  // Named the way charmd names it: --name, else the first heading of the starter's charm/AGENTS.md.
  const charm = name ?? readAgentName(join(dir, "charm"));
  ctx.out.write(`
  ${ctx.style.bold("Your charm's workspace is ready")} ${ctx.style.dim(dir)}

  cd ${dir}
  opencharm serve          start charmd here; it runs your agent in charm/
  opencharm sim            no charm yet? it appears in your browser (another terminal)
  opencharm pair <code>    the code on the charm (or the emulator); you choose its PIN

  The charm is called ${charm}: its name, colour and greeting are in opencharm.json ("charm"). README.md has the voice setup.
`);
}

export { initWorkspace, runInit };
export type { InitOptions };
