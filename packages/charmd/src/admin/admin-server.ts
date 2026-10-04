import { chmodSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import {
  type Server,
  type Socket,
  createConnection,
  createServer,
} from "node:net";

import type { AdminActions } from "./admin-actions";

const MAX_REQUEST_BYTES = 16 * 1024;
const COMMANDS = [
  "pair",
  "lock",
  "unlock",
  "revoke",
  "status",
  "devFace",
  "devSay",
  "devAsk",
  "look",
  "replies",
] as const;

function isCommand(value: unknown): value is (typeof COMMANDS)[number] {
  return (
    typeof value === "string" && (COMMANDS as readonly string[]).includes(value)
  );
}

function socketInUse(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createConnection(path);
    probe.on("connect", () => {
      probe.destroy();
      resolve(true);
    });
    probe.on("error", () => resolve(false));
  });
}

async function run(actions: AdminActions, request: unknown): Promise<unknown> {
  const { cmd, ...args } = (
    typeof request === "object" && request !== null ? request : {}
  ) as { cmd?: unknown };
  if (!isCommand(cmd))
    throw new Error(`Unknown command ${JSON.stringify(cmd)}`);
  return cmd === "status" ? actions.status() : actions[cmd](args);
}

function handle(socket: Socket, actions: AdminActions): void {
  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    if (buffer.length > MAX_REQUEST_BYTES) {
      socket.destroy();
      return;
    }
    const newline = buffer.indexOf("\n");
    if (newline < 0) return;
    let request: unknown;
    try {
      request = JSON.parse(buffer.slice(0, newline));
    } catch {
      socket.end(JSON.stringify({ ok: false, error: "Request is not JSON" }));
      return;
    }
    run(actions, request).then(
      (result) => socket.end(JSON.stringify({ ok: true, result })),
      (error: unknown) =>
        socket.end(
          JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        )
    );
  });
  socket.on("error", () => socket.destroy());
}

// The socket file is the permission boundary: mode 0600 means only the user charmd runs as
// (in production the dedicated "charmd" user) can pair, lock or revoke charms.
async function startAdminServer(
  path: string,
  actions: AdminActions
): Promise<Server> {
  // A fresh workspace has no state folder yet; it holds the socket and the state file, so owner-only.
  if (process.platform !== "win32")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (process.platform !== "win32" && existsSync(path)) {
    if (await socketInUse(path)) {
      throw new Error(
        `charmd is already running (admin socket ${path} is in use).`
      );
    }
    unlinkSync(path);
  }
  const server = createServer((socket) => handle(socket, actions));
  await new Promise<void>((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) =>
      reject(
        error.code === "EADDRINUSE"
          ? new Error(
              `charmd is already running (admin socket ${path} is in use).`
            )
          : error
      )
    );
    server.listen(path, resolve);
  });
  if (process.platform !== "win32") chmodSync(path, 0o600);
  return server;
}

export { startAdminServer };
