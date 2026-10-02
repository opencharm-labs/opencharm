import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { type Server, createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "@opencharm-labs/charmd/config";

import { flagValue } from "../args";
import type { CliContext } from "../context";

const DEFAULT_PORT = 5174;
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json",
};

// The built emulator ships next to the code: packages/cli/sim in development, next to dist/ once
// published.
function simDir(): string | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 4; i++) {
    const candidate = join(dir, "sim");
    if (existsSync(join(candidate, "charm_sim.wasm"))) return candidate;
    dir = dirname(dir);
  }
  return undefined;
}

// A static server for one folder, bound to loopback by the caller. Paths are resolved and must stay
// inside the folder: the emulator is served from a user's machine next to charmd's state.
function createSimServer(dir: string, charmdUrl: string): Server {
  const root = resolve(dir);
  return createServer((req, res) => {
    let path: string;
    try {
      path = decodeURIComponent(
        new URL(req.url ?? "/", "http://localhost").pathname
      );
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (path === "/config.json") {
      res
        .writeHead(200, { "content-type": TYPES[".json"] })
        .end(JSON.stringify({ url: charmdUrl }));
      return;
    }
    const file = resolve(
      root,
      normalize(`.${path === "/" ? "/index.html" : path}`)
    );
    if (
      !file.startsWith(root + sep) ||
      !existsSync(file) ||
      !statSync(file).isFile()
    ) {
      res.writeHead(404).end();
      return;
    }
    res
      .writeHead(200, {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
        "cache-control": "no-store",
      })
      .end(readFileSync(file));
  });
}

function charmdUrlFrom(args: readonly string[]): string {
  const explicit = flagValue(args, "--url");
  if (explicit) return explicit;
  try {
    const { listen } = loadConfig(flagValue(args, "--config"));
    const host =
      listen.host === "0.0.0.0" || listen.host === "::"
        ? "127.0.0.1"
        : listen.host;
    return `ws://${host.includes(":") ? `[${host}]` : host}:${listen.port}/charm`;
  } catch {
    return "ws://127.0.0.1:8787/charm";
  }
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  spawn(command, args, { stdio: "ignore", detached: true })
    .on("error", () => undefined)
    .unref();
}

async function runSim(ctx: CliContext, args: readonly string[]): Promise<void> {
  const dir = simDir();
  if (!dir) {
    ctx.err.write(
      "The emulator isn't built in this install. From the repo: npm run firmware:sim\n"
    );
    process.exitCode = 1;
    return;
  }
  const url = charmdUrlFrom(args);
  const port = Number(flagValue(args, "--port") ?? DEFAULT_PORT);
  const server = createSimServer(dir, url);
  try {
    await new Promise<void>((resolveListen, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolveListen);
    });
  } catch (error) {
    ctx.err.write(
      `The emulator could not start: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
    return;
  }
  const page = `http://127.0.0.1:${port}/`;
  ctx.out.write(
    `The emulator is at ${page} (charmd: ${url}). Hold Space to talk. Stop: Ctrl-C\n`
  );
  if (!args.includes("--no-open")) openBrowser(page);
}

export { createSimServer, runSim };
