import { createConnection } from "node:net";

type AdminReply = { ok: true; result: unknown } | { ok: false; error: string };

const MAX_REPLY_BYTES = 256 * 1024;

// One request, one reply, one connection: nothing to keep in sync between the CLI and the daemon.
function sendAdmin(
  socketPath: string,
  request: Record<string, unknown>
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      if (buffer.length > MAX_REPLY_BYTES)
        socket.destroy(new Error("admin reply too large"));
    });
    socket.on("end", () => {
      try {
        const reply = JSON.parse(buffer) as AdminReply;
        if (reply.ok) resolve(reply.result);
        else reject(new Error(reply.error));
      } catch {
        reject(new Error("charmd sent an unreadable reply"));
      }
    });
    socket.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT" || error.code === "ECONNREFUSED") {
        reject(
          new Error(
            `charmd is not running (no admin socket at ${socketPath}). Start it with: opencharm serve`
          )
        );
      } else if (error.code === "EACCES") {
        reject(
          new Error(
            `Permission denied on ${socketPath}. Run admin commands as the charmd user: sudo -u charmd opencharm …`
          )
        );
      } else {
        reject(error);
      }
    });
  });
}

export { sendAdmin };
export type { AdminReply };
