#!/usr/bin/env node
import { facesData } from "@opencharm-labs/design/faces";
import { loadConfig } from "@opencharm-labs/charmd/config";
import { sendAdmin } from "@opencharm-labs/charmd/admin-client";

import pkg from "../package.json" with { type: "json" };
import type { CliContext } from "./context";
import { createStyle, detectStyleOptions } from "./terminal";
import { flagValue, parseArgs } from "./args";
import { promptHidden } from "./prompt";
import { runAdminCommand } from "./commands/admin";
import { runFace } from "./commands/face";
import { runFaces } from "./commands/faces";
import { runHardware } from "./commands/hardware";
import { runHello } from "./commands/hello";
import { runHelp } from "./commands/help";
import { runInit } from "./commands/init";
import { serveMcp } from "./commands/mcp";
import { runServe } from "./commands/serve";
import { runSetup } from "./commands/setup";
import { runSim } from "./commands/sim";
import { runStates } from "./commands/states";

const DEFAULT_SIGNAL = "#FF5A1F";

function buildContext(argv: readonly string[]): CliContext {
  const options = detectStyleOptions(
    argv,
    process.env,
    process.stdout.isTTY === true
  );
  return {
    out: process.stdout,
    err: process.stderr,
    style: createStyle(options),
    canAnimate: options.color && !argv.includes("--no-anim") && !process.env.CI,
    version: pkg.version,
    signal: facesData.signal || DEFAULT_SIGNAL,
  };
}

async function main(argv: readonly string[]): Promise<void> {
  const ctx = buildContext(argv);
  const { command, rest, help, version } = parseArgs(argv);
  if (version) {
    ctx.out.write(`${ctx.version}\n`);
    return;
  }
  if (help || command === "help") {
    runHelp(ctx);
    return;
  }
  switch (command) {
    case "":
      await runHello(ctx, argv);
      return;
    case "face":
      await runFace(ctx, rest);
      return;
    case "faces":
      runFaces(ctx, rest);
      return;
    case "states":
      runStates(ctx, rest);
      return;
    case "hardware":
      runHardware(ctx);
      return;
    case "init":
      runInit(ctx, rest);
      return;
    case "sim":
      await runSim(ctx, rest);
      return;
    case "setup":
      runSetup(ctx, rest);
      return;
    case "serve":
      await runServe(ctx, rest);
      return;
    case "mcp": {
      // Started by the agent (charmd adds it to ACP sessions with --socket); talks to charmd.
      const socket =
        flagValue(rest, "--socket") ??
        loadConfig(flagValue(rest, "--config")).adminSocket;
      await serveMcp(process.stdin, process.stdout, {
        version: ctx.version,
        send: (request) => sendAdmin(socket, request),
      });
      return;
    }
    case "pair":
    case "lock":
    case "unlock":
    case "revoke":
    case "status":
    case "dev":
    case "look":
      await runAdminCommand(ctx, command, rest, {
        socket: loadConfig(flagValue(rest, "--config")).adminSocket,
        send: sendAdmin,
        prompt: promptHidden,
      });
      return;
    default:
      ctx.out.write(`Unknown command "${command}".\n`);
      runHelp(ctx);
      process.exitCode = 1;
  }
}

// `opencharm faces | head` closes the pipe early; that is a normal exit, not a crash.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

await main(process.argv.slice(2));
