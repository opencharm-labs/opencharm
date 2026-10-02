import type { IncomingMessage } from "node:http";

const TOKEN = /^[A-Za-z0-9_-]{1,256}$/;
// The WebSocket subprotocol charmd speaks; the emulator also offers "opencharm.token.<token>".
const SUBPROTOCOL = "opencharm";
const TOKEN_PREFIX = `${SUBPROTOCOL}.token.`;

// The charm sends "Authorization: Bearer <token>". Browsers can't set that header on a WebSocket,
// but they can offer subprotocols, so the emulator carries its token there. Tokens never go in URLs:
// behind a reverse proxy every request looks local, and proxies and logs keep URLs.
function tokenFrom(req: IncomingMessage): string | undefined {
  const header = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
  if (header !== undefined) return TOKEN.test(header) ? header : undefined;
  const offered = (req.headers["sec-websocket-protocol"] ?? "")
    .split(",")
    .map((p) => p.trim())
    .find((p) => p.startsWith(TOKEN_PREFIX));
  const token = offered?.slice(TOKEN_PREFIX.length);
  return token && TOKEN.test(token) ? token : undefined;
}

export { SUBPROTOCOL, tokenFrom };
