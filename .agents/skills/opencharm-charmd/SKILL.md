---
name: opencharm-charmd
description: Use when changing charmd (the charm daemon) in packages/charmd or its CLI commands (serve, pair, lock, unlock, revoke, status). Covers its features, the security rules it must keep, and how to test it with the fake charm.
---

# charmd, the charm daemon

charmd is thin: the door (protocol, audio), the guard (pairing, tokens, PIN, lock, revoke, permissions) and voice plumbing. Behaviour belongs to the agent. Read `packages/charmd/README.md` (the detail) and `OPENCHARM.md` ("charmd", "Protocol", "Security and permissions").

## Security rules (tests enforce them; never weaken one without a spec)

1. No plaintext token or PIN is ever stored or logged: tokens are SHA-256, PINs scrypt with a salt, compared in constant time.
2. Every connection starts locked; five wrong PINs block until the admin unlocks; the counter is persisted.
3. Before unlock, only `hello` and `charm:unlock` are acted on; `listen` and audio are answered with `locked`.
4. Inbound text frames go through `@opencharm-labs/protocol` `parseClientMessage`; a parse failure closes the socket (1008).
5. Frames are handled one at a time per session (`Session` queue), so unlock attempts can't race the counter.
6. Tokens never travel in URLs: `Authorization: Bearer` (charm) or the `opencharm.token.<token>` subprotocol (emulator); see `src/device/token.ts`.
7. The admin socket is 0600 and doubles as the one-daemon lock; charmd binds loopback unless `allowInsecureRemote`.

## Adding behaviour

- Per-connection logic goes in `src/device/session.ts` (a pure state machine: text/audio/admin events in, messages out). Add a table test in `session.test.ts` first.
- Anything reachable from the CLI goes in `src/admin/admin-actions.ts` with zod-validated input, then a command in `packages/cli/src/commands/admin.ts`.
- End-to-end behaviour gets a test in `src/daemon.test.ts` with `connectFakeCharm` (real sockets, port 0, temp state).
- Timings are injectable (`startDaemon(config, { timings })`), so tests never wait minutes.

## Voice, agents and turns

- An agent is `AgentAdapter` (`src/agent/types.ts`): `reply({ sessionKey, text, signal })` streams text; optional `warm` and `dispose`. Prefer ACP (`src/agent/acp.ts`): a new ACP agent is one entry in `src/agent/acp-agents.ts` (pin the adapter's exact version), not new code. ACP behaviour is tested against `src/agent/fixtures/fake-acp-agent.mjs`, a real ACP agent over stdio; HTTP adapters against a local stub (`agents.test.ts`).
- The charm's tools for agents live in `packages/cli/src/mcp/server.ts` (`opencharm mcp`, stdio JSON-RPC, no SDK) and call the admin socket (`devSay`, `devFace`, `devAsk`; no charm named = the connected, unlocked one). Never expose pairing, locking or revoking there.
- charmd offers ACP agents no file or terminal access. Permission requests become questions on the charm (`Session.ask`: one at a time, 30 s silence = no, ask_end on timeout/cancel); answers are always "once", never "always". Keep both unless a spec says otherwise.
- A voice is `VoiceProvider` (`src/voice/types.ts`): `transcribe(ogg)` and `synthesize(text) → Ogg Opus`. Never decode audio you can forward: the charm's packets and TTS output stay Opus.
- The turn (`src/turn/turn.ts`) owns ordering, pacing, abort, timeout and the failure lines; `say(text)` speaks without an agent. A generation number keeps cancelled turns silent; keep it that way.
- Measure latency with `scripts/smoke-turn.ts` and the per-turn JSON log; record numbers in `packages/charmd/README.md` ("A turn").

## Try it by hand

```bash
npm run cli -- serve --config ./opencharm.json     # {"listen":{"port":8787},"statePath":"state.json"}
npm run cli -- pair <code> --name pip               # PIN asked twice (piped input works: printf '1234\n1234\n' | …)
npm run cli -- status
```
