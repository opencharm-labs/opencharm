# 001: Protocol package

Status: Approved
Depends on: none

## Why

The charm, the emulator and charmd must agree on every message. One package holds the contract, and the same JSON fixtures test both the TypeScript and the C++ side, so the two can't drift.

## Scope

- `packages/protocol` (`@opencharm-labs/protocol`): zod schemas and TypeScript types for every message in `OPENCHARM.md` "Protocol": XiaoZhi messages we use (`hello`, `listen`, `abort`, `stt`, `tts`, `llm`) and ours (`{"type":"charm","op":...}`: `pair_code`, `paired`, `unlock`, `unlocked`, `locked`, `revoked`, `face`).
- Constants: audio parameters (up 16 kHz mono Opus, 60 ms; down 24 kHz), size limits, timeouts, face state ids (from `@opencharm-labs/design`).
- `parseClientMessage` / `parseServerMessage` returning a typed result or a typed error (never throws on bad input).
- `fixtures/valid/*.json` and `fixtures/invalid/*.json`: one file per message case. The C++ core (005) reads the same folder in its tests.
- Skill `opencharm-protocol`: how to add a message on both sides.
- **Typed text** (approved by the maintainer, 4 October 2026, for the desktop app's typing in spec 013): `{"type":"charm","op":"text","text":"…"}` from the charm to charmd, treated like a transcript but answered as text (spec 003). At most 2,000 characters; before `unlocked` charmd ignores it and answers `locked`, as for `listen`. The message tables in `packages/protocol/README.md` and `OPENCHARM.md` "Protocol" list it.

## Not in scope

Transport, sessions and state machines (004, 006).

## Acceptance

- [x] Every valid fixture parses; every invalid fixture fails with the expected error code (table test).
- [x] Unknown `type` or `op` is rejected, not ignored.
- [x] An invariant check fails if a schema has no fixture.
- [ ] `charm text`: valid and invalid fixtures (empty, too long, before unlock), parsed on both sides.
