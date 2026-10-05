import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";

import { readOggOpus } from "../audio/ogg-opus";
import { createMicrosoftSpeaker, escapeXml, secMsGec, ssml } from "./microsoft";

type Seen = { url: string; origin?: string; messages: string[] };

const servers: WebSocketServer[] = [];

// A minimal WebM holding Opus frames (one SimpleBlock each), as Microsoft's voice sends it.
function webm(frames: Buffer[]): Buffer {
  const el = (id: number[], body: Buffer) => {
    // A 4-byte EBML size: marker 0x10, then 28 bits of length.
    const size = Buffer.alloc(4);
    size.writeUInt32BE(0x10000000 | body.length);
    return Buffer.concat([Buffer.from(id), size, body]);
  };
  const blocks = frames.map((frame) =>
    el([0xa3], Buffer.concat([Buffer.from([0x81, 0, 0, 0x80]), frame]))
  );
  const cluster = el(
    [0x1f, 0x43, 0xb6, 0x75],
    Buffer.concat([el([0xe7], Buffer.from([0])), ...blocks])
  );
  return Buffer.concat([
    el([0x1a, 0x45, 0xdf, 0xa3], Buffer.alloc(0)),
    el([0x18, 0x53, 0x80, 0x67], cluster),
  ]);
}

// Opus frames whose TOC byte says 20 ms (config 27, mono).
const FRAMES = [
  Buffer.from([0xd8, 1, 2]),
  Buffer.from([0xd8, 3, 4]),
  Buffer.from([0xd8, 5]),
];

function audioFrame(audio: Buffer): Buffer {
  const header = Buffer.from(
    "X-RequestId:abc\r\nContent-Type:audio/webm\r\nPath:audio\r\n"
  );
  const length = Buffer.alloc(2);
  length.writeUInt16BE(header.length);
  return Buffer.concat([length, header, audio]);
}

async function serve(
  handle: (socket: WebSocket, seen: Seen) => void
): Promise<{ url: string; seen: Seen }> {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  servers.push(server);
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const seen: Seen = { url: "", messages: [] };
  server.on("connection", (socket, request) => {
    seen.url = request.url ?? "";
    seen.origin = request.headers.origin;
    socket.on("message", (data) => {
      seen.messages.push((data as Buffer).toString());
      if (seen.messages.length === 2) handle(socket, seen);
    });
  });
  return {
    url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    seen,
  };
}

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

describe("Microsoft's voice", () => {
  it("sends Edge's token, config and an SSML request, and returns the audio as Ogg Opus", async () => {
    const { url, seen } = await serve((socket) => {
      const audio = webm(FRAMES);
      socket.send(audioFrame(audio.subarray(0, 20)));
      socket.send(audioFrame(audio.subarray(20)));
      socket.send("X-RequestId:abc\r\nPath:turn.end\r\n\r\n{}");
    });
    const ogg = await createMicrosoftSpeaker({ url }).synthesize(
      "Ciao!",
      new AbortController().signal,
      "it"
    );
    expect(readOggOpus(ogg).packets).toEqual(FRAMES);
    expect(seen.url).toMatch(/Sec-MS-GEC=[0-9A-F]{64}&Sec-MS-GEC-Version=/);
    expect(seen.origin).toMatch(/^chrome-extension:\/\//);
    expect(seen.messages[0]).toMatch(
      /Path:speech\.config[\s\S]*webm-24khz-16bit-mono-opus/
    );
    expect(seen.messages[1]).toMatch(
      /Path:ssml[\s\S]*<voice name='it-IT-IsabellaNeural'>[\s\S]*Ciao!/
    );
  });

  it("uses the configured voice for a language, and English for one it has none for", () => {
    expect(ssml("Hi", "en-GB-SoniaNeural")).toContain("xml:lang='en-GB'");
  });

  it("escapes the reply so an agent's text can't become SSML", async () => {
    expect(escapeXml(`<voice name='x'>"&'`)).toBe(
      "&lt;voice name=&apos;x&apos;&gt;&quot;&amp;&apos;"
    );
    const { url, seen } = await serve((socket) => {
      socket.send(audioFrame(webm(FRAMES)));
      socket.send("Path:turn.end\r\n\r\n");
    });
    await createMicrosoftSpeaker({ url }).synthesize(
      "</prosody><break time='9s'/>",
      new AbortController().signal
    );
    expect(seen.messages[1]).not.toContain("<break");
    expect(seen.messages[1]).toContain("&lt;break time=&apos;9s&apos;/&gt;");
  });

  it("fails when the service closes early, sends no audio or takes too long", async () => {
    const early = await serve((socket) => socket.close());
    await expect(
      createMicrosoftSpeaker({ url: early.url }).synthesize(
        "Hi",
        new AbortController().signal
      )
    ).rejects.toThrow(/closed before it finished/);
    const silent = await serve((socket) =>
      socket.send("Path:turn.end\r\n\r\n")
    );
    await expect(
      createMicrosoftSpeaker({ url: silent.url }).synthesize(
        "Hi",
        new AbortController().signal
      )
    ).rejects.toThrow(/no audio/);
    const slow = await serve(() => undefined);
    await expect(
      createMicrosoftSpeaker({ url: slow.url, timeoutMs: 100 }).synthesize(
        "Hi",
        new AbortController().signal
      )
    ).rejects.toThrow(/too long/);
  });

  it("stops when the turn is cancelled", async () => {
    const { url } = await serve(() => undefined);
    const controller = new AbortController();
    const pending = createMicrosoftSpeaker({ url }).synthesize(
      "Hi",
      controller.signal
    );
    setTimeout(() => controller.abort(new Error("cancelled")), 50);
    await expect(pending).rejects.toThrow(/cancelled/);
  });

  it("rotates its token every five minutes", () => {
    const t = Date.UTC(2026, 9, 4, 12, 0, 0);
    expect(secMsGec(t)).toBe(secMsGec(t + 299_000));
    expect(secMsGec(t)).not.toBe(secMsGec(t + 300_000));
  });
});

// A voice service that answers each connection's request on that connection, and counts them.
async function serveEach(): Promise<{
  url: string;
  connections: () => number;
}> {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  servers.push(server);
  await new Promise<void>((resolve) => server.on("listening", resolve));
  let connections = 0;
  server.on("connection", (socket) => {
    connections += 1;
    let messages = 0;
    socket.on("message", () => {
      messages += 1;
      if (messages !== 2) return;
      socket.send(audioFrame(webm(FRAMES)));
      socket.send("X-RequestId:abc\r\nPath:turn.end\r\n\r\n{}");
    });
  });
  return {
    url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    connections: () => connections,
  };
}

describe("Microsoft's voice, primed while you speak", () => {
  it("opens the connection while the key is held, and the first sentence uses it", async () => {
    const { url, connections } = await serveEach();
    const speaker = createMicrosoftSpeaker({ url });
    speaker.prime();
    speaker.prime();
    await vi.waitFor(() => expect(connections()).toBe(1));
    const ogg = await speaker.synthesize("Hi.", new AbortController().signal);
    expect(readOggOpus(ogg).packets).toEqual(FRAMES);
    expect(connections()).toBe(1);
    // The next sentence opens its own, as before.
    await speaker.synthesize("Again.", new AbortController().signal);
    expect(connections()).toBe(2);
  });

  it("lets a spare connection go after a while, and opens a fresh one", async () => {
    const { url, connections } = await serveEach();
    const speaker = createMicrosoftSpeaker({ url, spareMs: 50 });
    speaker.prime();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const ogg = await speaker.synthesize("Hi.", new AbortController().signal);
    expect(readOggOpus(ogg).packets).toEqual(FRAMES);
    expect(connections()).toBe(2);
  });
});

describe("Microsoft's voice, when the primed connection has gone bad", () => {
  it("tries once more on a fresh connection before any audio, so the voice doesn't rest", async () => {
    const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    servers.push(server);
    await new Promise<void>((resolve) => server.on("listening", resolve));
    let connections = 0;
    server.on("connection", (socket) => {
      connections += 1;
      // The first (primed) connection dies as soon as it's asked; the next one answers.
      const dies = connections === 1;
      let messages = 0;
      socket.on("message", () => {
        messages += 1;
        if (messages !== 2) return;
        if (dies) return socket.terminate();
        socket.send(audioFrame(webm(FRAMES)));
        socket.send("X-RequestId:abc\r\nPath:turn.end\r\n\r\n{}");
      });
    });
    const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    const speaker = createMicrosoftSpeaker({ url });
    speaker.prime();
    await vi.waitFor(() => expect(connections).toBe(1));
    const ogg = await speaker.synthesize("Hi.", new AbortController().signal);
    expect(readOggOpus(ogg).packets).toEqual(FRAMES);
    expect(connections).toBe(2);
  });
});
