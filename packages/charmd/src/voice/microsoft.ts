// Microsoft's neural voices through Edge's read-aloud service (spec 003): no key, the best free voices
// we found (packages/charmd/README.md, the voice spike). The service is undocumented: the text of each
// spoken reply goes to Microsoft, and it may change or stop, so charmd falls back to the local voice
// (voice/speak.ts). Our own small client on `ws` instead of a package that would pull in axios and
// browser shims. The reply's text is XML-escaped, so nothing an agent writes can become markup.
import { createHash, randomUUID } from "node:crypto";

import WebSocket from "ws";

import { writeOggOpus } from "../audio/ogg-opus";
import { WebmOpusReader } from "../audio/webm-opus";
import { createChannel } from "./packets";

type MicrosoftOptions = {
  voices?: Record<string, string>;
  // Tests point at a local server.
  url?: string;
  timeoutMs?: number;
  // How long a connection opened ahead (prime) waits for its sentence before it's let go.
  spareMs?: number;
};

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const SERVICE_URL =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
// What Edge itself sends; the service refuses clients that don't look like it.
const GEC_VERSION = "1-143.0.3650.96";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";
const ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";
// Opus at 24 kHz, what the charm plays; the service sends it in WebM (it refuses Ogg), and the packets
// are rewrapped in Ogg like every other voice's.
const OUTPUT_FORMAT = "webm-24khz-16bit-mono-opus";
// The maintainer's picks for English and Italian (the voice spike); the others are Microsoft's
// standard voices for their language, not yet heard by anyone here.
const DEFAULT_VOICES: Record<string, string> = {
  en: "en-US-AvaMultilingualNeural",
  it: "it-IT-IsabellaNeural",
  es: "es-ES-ElviraNeural",
  fr: "fr-FR-DeniseNeural",
  de: "de-DE-KatjaNeural",
  pt: "pt-BR-FranciscaNeural",
};
const WINDOWS_EPOCH_SECONDS = 11644473600;

// The service's rotating token: SHA-256 of the time in Windows ticks, rounded down to 5 minutes, and
// the client token.
function secMsGec(nowMs = Date.now()): string {
  const seconds = Math.floor(nowMs / 1000) + WINDOWS_EPOCH_SECONDS;
  const ticks = BigInt(seconds - (seconds % 300)) * 10_000_000n;
  return createHash("sha256")
    .update(`${ticks}${TRUSTED_CLIENT_TOKEN}`)
    .digest("hex")
    .toUpperCase();
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function ssml(text: string, voice: string): string {
  const locale = voice.split("-").slice(0, 2).join("-");
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${locale}'>` +
    `<voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`
  );
}

function message(
  path: string,
  contentType: string,
  body: string,
  requestId?: string
): string {
  return (
    `X-Timestamp:${new Date().toISOString()}\r\n` +
    (requestId ? `X-RequestId:${requestId}\r\n` : "") +
    `Content-Type:${contentType}\r\nPath:${path}\r\n\r\n${body}`
  );
}

// Binary frames: a 2-byte big-endian header length, the header, then the audio.
function audioOf(frame: Buffer): Buffer | undefined {
  if (frame.length < 2) return undefined;
  const headerLength = frame.readUInt16BE(0);
  const header = frame.subarray(2, 2 + headerLength).toString();
  return header.includes("Path:audio")
    ? frame.subarray(2 + headerLength)
    : undefined;
}

function voiceFor(language: string, voices: Record<string, string>): string {
  return voices[language] ?? voices.en ?? DEFAULT_VOICES.en!;
}

function openSocket(options: MicrosoftOptions): WebSocket {
  const connection = randomUUID().replace(/-/g, "");
  const url =
    `${options.url ?? SERVICE_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${GEC_VERSION}&ConnectionId=${connection}`;
  return new WebSocket(url, {
    headers: { "User-Agent": USER_AGENT, Origin: ORIGIN },
    handshakeTimeout: options.timeoutMs ?? 15_000,
  });
}

// One sentence on a connection: `ready` is one opened ahead (prime), else a new one.
function connect(
  text: string,
  language: string,
  voices: Record<string, string>,
  signal: AbortSignal,
  options: MicrosoftOptions,
  ready?: WebSocket
): AsyncIterable<Buffer> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const connection = randomUUID().replace(/-/g, "");
  const packets = createChannel<Buffer>();
  const reader = new WebmOpusReader();
  let sent = 0;
  let settled = false;
  const socket = ready ?? openSocket(options);
  const finish = (error?: Error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
    socket.terminate();
    if (error) packets.fail(error);
    else if (sent === 0)
      packets.fail(new Error("Microsoft's voice sent no audio"));
    else packets.end();
  };
  const onAbort = () =>
    finish(
      signal.reason instanceof Error ? signal.reason : new Error("Aborted")
    );
  const timer = setTimeout(
    () => finish(new Error("Microsoft's voice took too long")),
    timeoutMs
  );
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });
  const request = () => {
    socket.send(
      message(
        "speech.config",
        "application/json; charset=utf-8",
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "false",
                },
                outputFormat: OUTPUT_FORMAT,
              },
            },
          },
        })
      )
    );
    socket.send(
      message(
        "ssml",
        "application/ssml+xml",
        ssml(text, voiceFor(language, voices)),
        connection
      )
    );
  };
  if (socket.readyState === WebSocket.OPEN) request();
  else socket.once("open", request);
  socket.on("message", (data, isBinary) => {
    const frame = Buffer.isBuffer(data)
      ? data
      : Buffer.concat(data as Buffer[]);
    if (!isBinary) {
      if (frame.toString().includes("Path:turn.end")) finish();
      return;
    }
    const audio = audioOf(frame);
    if (!audio?.length) return;
    try {
      for (const packet of reader.push(audio)) {
        sent += 1;
        packets.push(packet);
      }
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
  socket.on("unexpected-response", (_request, response) =>
    finish(
      new Error(`Microsoft's voice refused the request: ${response.statusCode}`)
    )
  );
  socket.on("error", (error) =>
    finish(new Error(`Microsoft's voice failed: ${error.message}`))
  );
  socket.on("close", () =>
    finish(new Error("Microsoft's voice closed before it finished"))
  );
  return packets;
}

function createMicrosoftSpeaker(options: MicrosoftOptions = {}) {
  const voices = { ...DEFAULT_VOICES, ...options.voices };
  // Microsoft kept an idle connection 25 s and had closed it by 45 s (measured, 5 October 2026).
  const spareMs = options.spareMs ?? 20_000;
  // Opening a connection takes about 400 ms (measured, 5 October 2026), most of the wait for the
  // first word of a short reply: one is opened while the key is held and used by the next sentence.
  // Used once, so nothing depends on the service taking several requests on one connection.
  let spare: { socket: WebSocket; until: number } | undefined;
  const takeSpare = (): WebSocket | undefined => {
    const taken = spare;
    spare = undefined;
    if (!taken) return undefined;
    const open =
      taken.socket.readyState === WebSocket.OPEN ||
      taken.socket.readyState === WebSocket.CONNECTING;
    if (open && Date.now() < taken.until) return taken.socket;
    taken.socket.terminate();
    return undefined;
  };
  const prime = () => {
    if (spare) return;
    const socket = openSocket(options);
    // Idle until a sentence takes it: a failure here only means the sentence opens its own.
    socket.on("error", () => undefined);
    spare = { socket, until: Date.now() + spareMs };
    setTimeout(() => {
      if (spare?.socket !== socket) return;
      spare = undefined;
      socket.terminate();
    }, spareMs).unref();
  };
  // A primed connection that fails before any audio (dropped while the agent thought) gets one
  // fresh try, so a stale socket never counts as Microsoft failing (voice/speak.ts would rest it).
  async function* stream(text: string, signal: AbortSignal, language = "en") {
    const ready = takeSpare();
    if (ready) {
      let spoke = false;
      try {
        for await (const packet of connect(
          text,
          language,
          voices,
          signal,
          options,
          ready
        )) {
          spoke = true;
          yield packet;
        }
        return;
      } catch (error) {
        if (spoke || signal.aborted) throw error;
      }
    }
    yield* connect(text, language, voices, signal, options);
  }
  return {
    name: "microsoft",
    prime,
    stream,
    async synthesize(
      text: string,
      signal: AbortSignal,
      language = "en"
    ): Promise<Buffer> {
      const packets: Buffer[] = [];
      for await (const packet of stream(text, signal, language))
        packets.push(packet);
      return writeOggOpus(packets, { inputSampleRate: 24000 });
    },
  };
}

export { DEFAULT_VOICES, createMicrosoftSpeaker, escapeXml, secMsGec, ssml };
export type { MicrosoftOptions };
