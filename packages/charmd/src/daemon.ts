import { randomUUID } from "node:crypto";
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from "node:http";
import type { AddressInfo } from "node:net";

import { LIMITS, TIMEOUTS } from "@opencharm-labs/protocol/constants";
import { WebSocketServer } from "ws";

import { type AdminActions, createAdminActions } from "./admin/admin-actions";
import { startAdminServer } from "./admin/admin-server";
import { PairingRegistry } from "./auth/pairing";
import { type CharmdConfig, isLoopback } from "./config/config";
import { type Announce, announceOnNetwork } from "./device/announce";
import { handleOta, isOtaRequest } from "./device/ota";
import { toBuffer } from "./device/raw-data";
import { SUBPROTOCOL, tokenFrom } from "./device/token";
import { Session } from "./device/session";
import { CharmLook, readAgentName } from "./look";
import { StateStore } from "./store/state-store";
import { TurnController } from "./turn/turn";
import { MODELS, modelState } from "./voice/models";
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
  // Which starter commit the workspace began from (spec 015), shown in status.
  starter?: string;
  // How charmd announces itself on the local network (spec 002); tests pass a fake.
  announce?: Announce;
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
  // Shared with the admin command "replies", read at the start of each turn.
  const replies = { speak: config.speakReplies };
  // Load the local models now (downloading them the first time), not during the first question.
  void voice.warm?.().catch(() => undefined);
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
    starter: options.starter,
    replies,
    voice: () => {
      const downloading = (["parakeet", "supertonic"] as const).flatMap(
        (id) => {
          const state = modelState(id);
          // Why it failed is in the turn's line and the log; status names which model.
          if (state.state === "failed") return [`${MODELS[id].label} failed`];
          return state.state === "downloading" && state.total
            ? [
                `${MODELS[id].label} downloading ${Math.floor((state.received * 100) / state.total)}%`,
              ]
            : [];
        }
      );
      return [voice.name, ...downloading].join(" · ");
    },
  });
  // Claim the admin socket first: it doubles as the "one charmd per state file" lock.
  const adminServer = await startAdminServer(config.adminSocket, admin);

  let websocketUrl = config.publicUrl ?? "";
  const answerHttp =
    (onNetwork: boolean) => (req: IncomingMessage, res: ServerResponse) => {
      if (isOtaRequest(req)) {
        // On the network listener (no publicUrl), the address the device reached us at: the
        // loopback one would send a stock XiaoZhi device nowhere.
        const host = req.headers.host ?? "";
        const reached =
          onNetwork &&
          !config.publicUrl &&
          /^[A-Za-z0-9.:[\]-]{1,255}$/.test(host)
            ? `ws://${host}/charm`
            : websocketUrl;
        handleOta(res, reached);
        return;
      }
      res.writeHead(404).end();
    };
  const http: Server = createServer(answerHttp(false));
  // Charms on the home network (spec 002) get a listener of their own; the one above keeps its
  // address, so the desktop app's own charm never shares a port someone else could take first.
  const network: Server | undefined = config.network
    ? createServer(answerHttp(true))
    : undefined;
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: LIMITS.maxJsonBytes,
    // Answer "opencharm" when offered (the emulator must get it back or the browser drops the socket).
    handleProtocols: (protocols) =>
      protocols.has(SUBPROTOCOL) ? SUBPROTOCOL : false,
  });

  // ws re-emits the HTTP server's errors; the listen() below reports them, so don't crash here.
  wss.on("error", () => undefined);
  // Both listeners hand /charm to the one WebSocket server; anything else is refused.
  for (const server of [http, network]) {
    server?.on("upgrade", (req, socket, head) => {
      if ((req.url ?? "").split("?")[0] !== "/charm") {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) =>
        wss.emit("connection", ws, req)
      );
    });
  }

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
          // Only the desktop charm can read instead of listen: a charm on a board always speaks.
          speakAloud: () => io.kind() !== "desktop" || replies.speak,
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

  const listen = (server: Server, port: number, host: string) =>
    new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, resolve);
    });
  try {
    await listen(http, config.listen.port, config.listen.host);
    if (network && config.network)
      await listen(network, config.network.port, config.network.host);
  } catch (error) {
    http.close();
    network?.close();
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
  // Beyond loopback, say so on the local network, so a board can find this charmd (spec 002): the
  // network listener's port, else the main one's when that one faces the network itself.
  const networkPort = network
    ? (network.address() as AddressInfo).port
    : undefined;
  const announced =
    networkPort ?? (isLoopback(config.listen.host) ? undefined : port);
  const stopAnnouncing =
    config.discoverable && announced !== undefined
      ? (options.announce ?? announceOnNetwork)(announced)
      : undefined;
  websocketUrl = config.publicUrl ?? url;
  if (!options.quiet)
    console.log(
      ["charmd", options.identity, "listening on", url]
        .filter(Boolean)
        .join(" ")
    );
  if (!options.quiet && networkPort !== undefined && config.network)
    console.log(
      `Charms on this network: ws://${config.network.host}:${networkPort}/charm`
    );

  return {
    url,
    admin,
    close: async () => {
      clearInterval(heartbeat);
      await stopAnnouncing?.();
      for (const client of wss.clients) client.terminate();
      agent.dispose?.();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
      if (network)
        await new Promise<void>((resolve) => network.close(() => resolve()));
      await new Promise<void>((resolve) => adminServer.close(() => resolve()));
    },
  };
}

export { startDaemon };
export type { Daemon, DaemonOptions };
