import { z } from "zod";

import { FACE_STATES, SIGNAL_COLOUR } from "./constants";
import { utf8Length } from "./text";

type Kinded = { type: string; op?: string };

const sessionId = z.string().min(1).max(128).optional();
// Text the charm shows is limited in UTF-8 bytes, as the charm counts it.
const shownText = (min: number, maxBytes: number) =>
  z
    .string()
    .min(min)
    .refine((text) => utf8Length(text) <= maxBytes, {
      message: `at most ${maxBytes} bytes`,
    });
// A question's id: short, so it fits the charm's memory and logs.
const askId = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);
// The hint under a question reads "HOLD · ALLOW    PRESS · NO"; labels fit one line.
const askLabel = shownText(1, 12);
const audioParams = z.object({
  format: z.literal("opus"),
  sample_rate: z.number().int().positive(),
  channels: z.number().int().min(1).max(2),
  frame_duration: z.number().int().positive(),
});

// Charm → charmd
// What the charm runs (spec 015): the board's firmware, the emulator, or the desktop app's emulator.
// `version` is the release identity of what ships it (cli@0.2.0, desktop@0.2.0), `commit` the core's.
// Only plain characters, so `opencharm status` can print it safely; fields charmd doesn't know are
// ignored and any kind is kept, so newer charms still connect, and a build that doesn't fit is
// dropped: it's information, never a reason to refuse a charm.
const plain = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[\w.@+-]+$/);
const charmBuild = z.object({
  kind: plain(16),
  version: plain(64),
  commit: plain(40),
});
const build = charmBuild.optional().catch(undefined);
const clientHello = z.object({
  type: z.literal("hello"),
  version: z.number().int().positive(),
  features: z.record(z.string(), z.boolean()).optional(),
  transport: z.literal("websocket"),
  audio_params: audioParams,
  build,
});
const listen = z.object({
  session_id: sessionId,
  type: z.literal("listen"),
  state: z.enum(["start", "stop", "detect"]),
  mode: z.enum(["auto", "manual", "realtime"]).optional(),
  text: z.string().max(2000).optional(),
});
const abort = z.object({
  session_id: sessionId,
  type: z.literal("abort"),
  reason: z.string().max(64).optional(),
});
const unlock = z.object({
  type: z.literal("charm"),
  op: z.literal("unlock"),
  // The PIN pad accepts 4 to 12 digits; charmd hashes it, the charm never stores it.
  pin: z.string().regex(/^\d{4,12}$/),
});

// The answer to a question shown on the charm: hold = yes, press = no.
const answer = z.object({
  type: z.literal("charm"),
  op: z.literal("answer"),
  id: askId,
  yes: z.boolean(),
});

// charmd → charm
const serverHello = z.object({
  type: z.literal("hello"),
  transport: z.literal("websocket"),
  session_id: z.string().min(1).max(128),
  audio_params: audioParams,
});
const stt = z.object({
  session_id: sessionId,
  type: z.literal("stt"),
  text: z.string().max(2000),
});
const tts = z.object({
  session_id: sessionId,
  type: z.literal("tts"),
  state: z.enum(["start", "sentence_start", "stop"]),
  text: z.string().max(2000).optional(),
});
const llm = z.object({
  session_id: sessionId,
  type: z.literal("llm"),
  emotion: z.string().max(32),
  text: z.string().max(32).optional(),
});
const pairCode = z.object({
  type: z.literal("charm"),
  op: z.literal("pair_code"),
  code: z.string().regex(/^\d{6}$/),
  expires_in: z.number().int().positive(),
});
const paired = z.object({
  type: z.literal("charm"),
  op: z.literal("paired"),
  token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
});
const unlocked = z.object({
  type: z.literal("charm"),
  op: z.literal("unlocked"),
});
const locked = z.object({
  type: z.literal("charm"),
  op: z.literal("locked"),
  reason: z.enum(["boot", "wrong_pin", "remote", "blocked"]),
  tries_left: z.number().int().min(0).optional(),
});
const revoked = z.object({
  type: z.literal("charm"),
  op: z.literal("revoked"),
});
const face = z.object({
  type: z.literal("charm"),
  op: z.literal("face"),
  state: z.enum(FACE_STATES as [string, ...string[]]),
  // A short line shown without speech, e.g. "Can't reach Hermes".
  text: shownText(0, 200).optional(),
});

// The charm's identity (spec 014): sent after every unlock and when it changes. Orange is never an
// identity colour: on the screen it only means "it needs you".
const look = z.object({
  type: z.literal("charm"),
  op: z.literal("look"),
  name: shownText(1, 24).refine((name) => [...name].length <= 12, {
    message: "at most 12 characters",
  }),
  glyph: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "a #RRGGBB colour")
    .refine((hex) => hex.toUpperCase() !== SIGNAL_COLOUR, {
      message: "orange is reserved for 'it needs you'",
    }),
  greeting: shownText(0, 40),
  sleep_ms: z.number().int().min(0).max(86_400_000),
  motion: z.enum(["full", "calm"]),
});

// A question for the person holding the charm (the decision layout: orange ring, hold or press).
const ask = z.object({
  type: z.literal("charm"),
  op: z.literal("ask"),
  id: askId,
  text: shownText(1, 200),
  yes: askLabel.optional(),
  no: askLabel.optional(),
});
// The question is gone (answered elsewhere, timed out, or its turn was cancelled).
const askEnd = z.object({
  type: z.literal("charm"),
  op: z.literal("ask_end"),
  id: askId,
});

const CLIENT_SCHEMAS = {
  hello: clientHello,
  listen,
  abort,
  "charm:unlock": unlock,
  "charm:answer": answer,
} as const;
const SERVER_SCHEMAS = {
  hello: serverHello,
  stt,
  tts,
  llm,
  "charm:pair_code": pairCode,
  "charm:paired": paired,
  "charm:unlocked": unlocked,
  "charm:locked": locked,
  "charm:revoked": revoked,
  "charm:face": face,
  "charm:ask": ask,
  "charm:ask_end": askEnd,
  "charm:look": look,
} as const;

type ClientMessage = z.infer<
  (typeof CLIENT_SCHEMAS)[keyof typeof CLIENT_SCHEMAS]
>;
type ServerMessage = z.infer<
  (typeof SERVER_SCHEMAS)[keyof typeof SERVER_SCHEMAS]
>;

const CLIENT_KINDS = Object.keys(CLIENT_SCHEMAS);
const SERVER_KINDS = Object.keys(SERVER_SCHEMAS);

// Our own messages share type "charm" and are told apart by op; XiaoZhi's are told apart by type.
function messageKind(message: Kinded): string {
  return message.type === "charm" ? `charm:${message.op ?? ""}` : message.type;
}

export {
  CLIENT_KINDS,
  charmBuild,
  CLIENT_SCHEMAS,
  SERVER_KINDS,
  SERVER_SCHEMAS,
  messageKind,
};
export type { ClientMessage, ServerMessage };
export type CharmBuild = z.infer<typeof charmBuild>;
