import type { ServerMessage } from "@opencharm-labs/protocol/messages";
import WebSocket from "ws";

import { toBuffer } from "../device/raw-data";

type FakeCharm = {
  ws: WebSocket;
  messages: ServerMessage[];
  // Every message in arrival order; next() doesn't consume from it, so tests can check the order.
  received: ServerMessage[];
  closeCode: Promise<number>;
  send: (message: object) => void;
  sendAudio: (bytes: number) => void;
  audioFrames: () => number;
  next: (
    predicate: (m: ServerMessage) => boolean,
    timeoutMs?: number
  ) => Promise<ServerMessage>;
};

const HELLO = {
  type: "hello",
  version: 1,
  features: { opencharm: true },
  transport: "websocket",
  audio_params: {
    format: "opus",
    sample_rate: 16000,
    channels: 1,
    frame_duration: 60,
  },
};

// A stand-in for the charm's firmware: enough of the device side of the protocol to drive charmd in tests.
async function connectFakeCharm(
  url: string,
  token?: string
): Promise<FakeCharm> {
  const ws = new WebSocket(url, {
    headers: {
      "Protocol-Version": "1",
      "Device-Id": "aa:bb:cc:dd:ee:ff",
      "Client-Id": "test-client",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const messages: ServerMessage[] = [];
  const received: ServerMessage[] = [];
  let audio = 0;
  const waiters: Array<{
    predicate: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
  }> = [];
  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      audio += 1;
      return;
    }
    const message = JSON.parse(
      toBuffer(data).toString("utf8")
    ) as ServerMessage;
    messages.push(message);
    received.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.predicate(message)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    }
  });
  const closeCode = new Promise<number>((resolve) =>
    ws.on("close", (code) => resolve(code))
  );
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  const charm: FakeCharm = {
    ws,
    messages,
    received,
    closeCode,
    send: (message) => ws.send(JSON.stringify(message)),
    sendAudio: (bytes) => ws.send(Buffer.alloc(bytes)),
    audioFrames: () => audio,
    next: (predicate, timeoutMs = 3000) => {
      const seen = messages.find(predicate);
      if (seen) {
        messages.splice(messages.indexOf(seen), 1);
        return Promise.resolve(seen);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("timed out waiting for a message")),
          timeoutMs
        );
        waiters.push({
          predicate,
          resolve: (m) => {
            clearTimeout(timer);
            messages.splice(messages.indexOf(m), 1);
            resolve(m);
          },
        });
      });
    },
  };
  charm.send(HELLO);
  return charm;
}

function isOp(op: string) {
  return (m: ServerMessage) => m.type === "charm" && m.op === op;
}

export { connectFakeCharm, isOp };
export type { FakeCharm };
