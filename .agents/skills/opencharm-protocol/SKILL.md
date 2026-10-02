---
name: opencharm-protocol
description: Use when adding or changing a message between the charm (or emulator) and charmd, or when handling protocol input in charmd or the firmware. Covers the schemas, the never-throw parser, the shared fixtures and the rules for both sides.
---

# OpenCharm protocol

The contract lives in `packages/protocol` and is described in `packages/protocol/README.md` (summary in `OPENCHARM.md`, "Protocol"). We speak xiaozhi-esp32's WebSocket protocol and add one message type, `{"type": "charm", "op": ...}`, for everything that is ours.

## Files

- `src/constants.ts`: protocol version, audio parameters (up 16 kHz, down 24 kHz, Opus, 60 ms), size limits, timeouts, face states.
- `src/messages.ts`: one zod schema per message kind (`hello`, `listen`, `charm:unlock`, …) in `CLIENT_SCHEMAS` (charm → charmd) and `SERVER_SCHEMAS` (charmd → charm).
- `src/parse.ts`: `parseClientMessage` / `parseServerMessage` return `{ ok, message }` or `{ ok: false, error: { code, detail } }`; they never throw.
- `fixtures/valid`, `fixtures/invalid`: one JSON file per case, read by the TypeScript tests and by the C++ core (spec 005).

## Adding a message

1. Add the schema to `CLIENT_SCHEMAS` or `SERVER_SCHEMAS` (key = `type`, or `charm:<op>`).
2. Add a valid fixture (the kinds test fails until you do) and at least one invalid fixture with its expected `error`.
3. Handle it on both sides: charmd (`packages/charmd`) and the firmware core (`firmware/core`), whose tests read the same fixtures.
4. Update the message tables in `packages/protocol/README.md`, and the summary in `OPENCHARM.md` ("Protocol") if a message family changes.

## Rules

- Validate every inbound text frame with the parser before acting on it; binary frames are Opus audio and are size-checked against `LIMITS.maxAudioFrameBytes`.
- Unknown fields are stripped, unknown types and ops are rejected: newer peers can add fields without breaking older ones.
- Nothing is accepted from a charm before it is unlocked except `hello` and `charm:unlock` (enforced by charmd, spec 002).
