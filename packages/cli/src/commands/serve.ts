import { loadConfig } from "@opencharm-labs/charmd/config";
import { startDaemon } from "@opencharm-labs/charmd/daemon";

import { flagValue } from "../args";
import type { CliContext } from "../context";
import { identity, starterCommit } from "../identity";

// Runs charmd, the charm daemon, in the foreground; systemd or a terminal owns its lifetime.
async function runServe(
  ctx: CliContext,
  args: readonly string[]
): Promise<void> {
  let config;
  let daemon;
  try {
    config = loadConfig(flagValue(args, "--config"));
    daemon = await startDaemon(config, {
      quiet: true,
      identity: identity().text,
      starter: starterCommit(
        config.agent.adapter === "acp" ? config.agent.cwd : process.cwd()
      ),
      // The charm's tools for ACP agents: this same CLI as `opencharm mcp`. execArgv keeps loaders
      // such as tsx in development; a debugger flag must not be copied into every child.
      charmTools: {
        command: process.execPath,
        args: [
          ...process.execArgv.filter((arg) => !arg.startsWith("--inspect")),
          process.argv[1] ?? "",
          "mcp",
        ],
      },
      log: (entry) =>
        ctx.out.write(
          `${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`
        ),
    });
  } catch (error) {
    ctx.err.write(
      `charmd could not start: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
    return;
  }
  ctx.out.write(
    `charmd (the charm daemon) ${identity().text} is listening on ${daemon.url}\n`
  );
  ctx.out.write(`Admin socket: ${config.adminSocket}\n`);
  ctx.out.write("Pair a charm: opencharm pair <code>   Stop: Ctrl-C\n");
  const stop = () => {
    void daemon.close().then(() => process.exit(0));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

export { runServe };
