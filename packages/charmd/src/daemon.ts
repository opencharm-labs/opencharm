import { randomUUID } from "node:crypto";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { LIMITS, TIMEOUTS } from "@opencharm-labs/protocol/constants";
import { WebSocketServer } from "ws";

import { type AdminActions, createAdminActions } from "./admin/admin-actions";
import { startAdminServer } from "./admin/admin-server";
import { PairingRegistry } from "./auth/pairing";
import type { CharmdConfig } from "./config/config";
import { handleOta, isOtaRequest } from "./device/ota";
import { toBuffer } from "./device/raw-data";
import { SUBPROTOCOL, tokenFrom } from "./device/token";
import { Session } from "./device/session";
import { CharmLook, readAgentName } from "./look";
import { StateStore } from "./store/state-store";
import { TurnController } from "./turn/turn";
import { createAgentFromConfig, createVoiceFromConfig } from "./wiring";
import type { ToolsCommand } from "./wiring";

type DaemonOptions = {
  timings?: {
    unpairedIdleMs?: number;
    pairCodeMs?: number;
    heartbeatMs?: number;
  };
  quiet?: boolean;
  // What this charmd is (spec 015), e.g. "cli@0.2.0 (abc1234)": logged at start and in status.
  identity?: string;
  // Where per-turn timing entries go; defaults to JSON lines on stdout unless quiet.
  log?: (entry: Record<string, unknown>) => void;
  // How to start `opencharm mcp` (the charm's tools for ACP agents); the CLI passes itself.
  charmTools?: ToolsCommand;
};
type Daemon = {
  url: string;
  admin: AdminActions;
  close: () => Promise<void>;
};

const CLOSE_POLICY = 1008;
const CLOSE_BUSY = 1013;
// A WebSocket ping every 30 s (one timer for all connections; clients answer it themselves): a charm
// that left Wi-Fi or a laptop that went to sleep is dropped, instead of holding a session forever.
const HEARTBEAT_MS = 30_000;

async function startDaemon(
  config: CharmdConfig,
  options: DaemonOptions = {}
): Promise<Daemon> {
  const unpairedIdleMs =
    options.timings?.unpairedIdleMs ?? TIMEOUTS.unpairedIdleSeconds * 1000;
  const pairCodeMs =
    options.timings?.pairCodeMs ?? TIMEOUTS.pairCodeSeconds * 1000;
  const store = new StateStore(config.statePath);
  const pairing = new PairingRegistry({
    ttlMs: pairCodeMs,
    maxPending: config.maxConnections,
  });
  const sessions = new Map<string, Session>();
  const voice = createVoiceFromConfig(config);
  const log =
    options.log ??
    ((entry: Record<string, unknown>) => {
      if (!options.quiet)
        console.log(
          JSON.stringify({ time: new Date().toISOString(), ...entry })
        );
    });
  const agent = createAgentFromConfig(
    config,
    (message) => log({ event: "agent", message }),
    options.charmTools
  );
  const { agentCanChangeLook, ...lookSettings } = config.charm;
  const look = new CharmLook(
    lookSettings,
    readAgentName(config.agent.adapter === "acp" ? config.agent.cwd : undefined)
  );
  const admin = createAdminActions({
    store,
    pairing,
    sessions: () => sessions.values(),
    look,
    agentCanChangeLook,
    identity: options.identity,
  });
  // Claim the admin socket first: it doubles as the "one charmd per state file" lock.
  const adminServer = await startAdminServer(config.adminSocket, admin);

  let websocketUrl = config.publicUrl ?? "";
  const http: Server = createServer((req, res) => {
    if (isOtaRequest(req)) {
      handleOta(res, websocketUrl);
      return;
    }
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({
    server: http,
    path: "/charm",
    maxPayload: LIMITS.maxJsonBytes,
    // Answer "opencharm" when offered (the emulator must get it back or the browser drops the socket).
    handleProtocols: (protocols) =>
      protocols.has(SUBPROTOCOL) ? SUBPROTOCOL : false,
  });

  // ws re-emits the HTTP server's errors; the listen() below reports them, so don't crash here.
  wss.on("error", () => undefined);

  const answered = new WeakSet<object>();
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!answered.has(client)) {
        client.terminate();
        continue;
      }
      answered.delete(client);
      client.ping();
    }
  }, options.timings?.heartbeatMs ?? HEARTBEAT_MS);

  wss.on("connection", (ws, req) => {
    if (sessions.size >= config.maxConnections) {
      ws.close(CLOSE_BUSY);
      return;
    }
    const session = new Session({
      store,
      pairing,
      connectionId: randomUUID(),
      token: tokenFrom(req),
      look: () => look.message(),
      outbound: {
        send: (message) => ws.send(JSON.stringify(message)),
        sendAudio: (packet) => ws.send(packet, { binary: true }),
        close: (code) => ws.close(code),
      },
      createTurn: (io) =>
        new TurnController({
          ...io,
          voice,
          agent,
          timeoutMs: config.turnTimeoutSeconds * 1000,
          logTranscripts: config.logTranscripts,
          log,
        }),
    });
    sessions.set(session.connectionId, session);
    answered.add(ws);
    ws.on("pong", () => answered.add(ws));
    const idle = setTimeout(() => {
      if (session.state === "awaiting_hello" || session.state === "unpaired")
        ws.close(CLOSE_POLICY);
    }, unpairedIdleMs);
    const refresh = setInterval(() => session.refreshPairCode(), pairCodeMs);
    ws.on("message", (data, isBinary) => {
      const buffer = toBuffer(data);
      if (isBinary) void session.onBinary(buffer);
      else void session.onText(buffer.toString("utf8"));
    });
    ws.on("close", () => {
      clearTimeout(idle);
      clearInterval(refresh);
      session.closed();
      sessions.delete(session.connectionId);
    });
    ws.on("error", () => ws.terminate());
  });

  try {
    await new Promise<void>((resolve, reject) => {
      http.once("error", reject);
      http.listen(config.listen.port, config.listen.host, resolve);
    });
  } catch (error) {
    clearInterval(heartbeat);
    // Give the admin socket back, or the next start would think a charmd is already running.
    await new Promise<void>((resolve) => adminServer.close(() => resolve()));
    throw error;
  }
  const { port } = http.address() as AddressInfo;
  const host = config.listen.host.includes(":")
    ? `[${config.listen.host}]`
    : config.listen.host;
  const url = `ws://${host}:${port}/charm`;
  websocketUrl = config.publicUrl ?? url;
  if (!options.quiet)
    console.log(
      `charmd ${options.identity ?? ""} listening on ${url}`.replace("  ", " ")
    );

  return {
    url,
    admin,
    close: async () => {
      clearInterval(heartbeat);
      for (const client of wss.clients) client.terminate();
      agent.dispose?.();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
      await new Promise<void>((resolve) => adminServer.close(() => resolve()));
    },
  };
}

export { startDaemon };
export type { Daemon, DaemonOptions };
