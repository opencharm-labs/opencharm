# @opencharm-labs/charmd — charmd, the charm daemon

charmd is the program between a charm and the agent you run. It is the charm's door and its guard; everything about behaviour belongs to the agent. Overview: [OPENCHARM.md](../../OPENCHARM.md) ("charmd", "Security and permissions"); messages: [packages/protocol](../protocol/README.md). It ships inside the `opencharm` CLI (`opencharm serve`), not as its own npm package.

**Principle**: charmd owns the door (protocol, audio transport), the guard (pairing, tokens, PIN, lock, permissions) and voice plumbing (speech-to-text and text-to-speech with the user's key). Behaviour (memory, persona, speaking style, what to show, when to speak) belongs to the agent.

**Runtime**: Node 24, TypeScript. Runtime dependencies: `ws`, `zod`, `@agentclientprotocol/sdk`, `opusscript`. Ogg wrapping is our own code. State is one JSON file written atomically (write temp, rename); no database. Default state folder: `~/.opencharm/` (one charmd per machine, like one agent at a time).

## Features

| Folder          | Job                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config/`   | `opencharm.json` / `/etc/opencharm/charmd.json`, validated with zod; loopback-only unless `allowInsecureRemote`                                                 |
| `src/auth/`     | tokens (32 random bytes, only SHA-256 stored), PINs (scrypt), pairing codes (6 digits, 300 s, in memory)                                                        |
| `src/store/`    | one JSON state file, atomic writes, mode 0600                                                                                                                   |
| `src/device/`   | the `Session` state machine per connection (unpaired → locked → unlocked), tokens from the WebSocket request, the `/ota/` answer                                |
| `src/admin/`    | what the CLI can do (`pair`, `lock`, `unlock`, `revoke`, `status`, `look`) over a 0600 local socket                                                             |
| `src/look.ts`   | the charm's identity (spec 014): the `charm` block and its defaults turned into the `charm:look` message, and live changes to it                                |
| `src/daemon.ts` | the HTTP + WebSocket server (`/charm`, `/ota/`); wires it all together: `startDaemon(config)`                                                                   |
| `src/audio/`    | Ogg Opus reader/writer (RFC 7845) and an Opus codec helper for the local and fake voices                                                                        |
| `src/voice/`    | speech providers: `openai`, `local` (macOS `say` + whisper.cpp), `fake`                                                                                         |
| `src/agent/`    | agent adapters: `acp` (any ACP agent over stdio; presets in `acp-agents.ts`), `openai-compatible` (and the `openclaw` preset), `hermes` (Responses API), `fake` |
| `src/turn/`     | one voice turn: listen → speech-to-text → agent → sentence-by-sentence speech, with abort and timeout                                                           |

## Config

`opencharm.json` next to where you run `opencharm serve` (or `--config <file>`; `/etc/opencharm/charmd.json` in production). Everything is optional; a fresh charmd runs with the fake voice and agent.

```json
{
  "listen": { "host": "127.0.0.1", "port": 8787 },
  "statePath": "state.json",
  "voice": { "provider": "local" },
  "agent": { "adapter": "acp", "agent": "claude", "cwd": "." },
  "turnTimeoutSeconds": 60,
  "logTranscripts": false,
  "charm": { "name": "Momo", "colour": "lilac" }
}
```

| `voice.provider` | Needs                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `fake`           | nothing (hears "hello", speaks a tone)                                                             |
| `local`          | macOS `say`, `whisper-cli` (`brew install whisper-cpp`) and `~/.opencharm/models/ggml-base.en.bin` |
| `openai`         | `OPENAI_API_KEY` (or `apiKey`); optional `sttModel`, `ttsModel`, `voice`                           |

| `agent.adapter`     | Fields                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fake`              | none (answers "You said: …")                                                                                                                         |
| `acp`               | `agent` (`claude`, `codex`, `gemini`, `goose`, `hermes`, `openclaw`) or `command`; `cwd` (default: the config's folder), optional `projects`, `mode` |
| `hermes`            | `baseUrl` (default `http://127.0.0.1:8642/v1`), `model` (default `hermes-agent`), key `API_SERVER_KEY`                                               |
| `openclaw`          | `baseUrl` (Gateway, `/v1`), `agentId` (default `main`), key `OPENCLAW_GATEWAY_TOKEN`                                                                 |
| `openai-compatible` | `baseUrl`, `model`, optional key                                                                                                                     |

Keys: `apiKey` in the file, or `apiKeyEnv` naming an environment variable.

| `charm` (spec 014)   | Default                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `name`               | the first `# ` heading of `AGENTS.md` in the ACP agent's `cwd`, else `Charm`; ≤ 12 characters  |
| `colour`             | `white`; or `cobalt`, `lime`, `lilac`, `sun`, `coal` (the glyphs light up in its glyph colour) |
| `greeting`           | `Hi! I'm {name}.`; ≤ 40 bytes, `""` for none                                                   |
| `sleepAfterMinutes`  | `4`; `0` = never, at most 1440                                                                 |
| `motion`             | `full`; `calm` keeps breathing and blinks but no glances or squash                             |
| `agentCanChangeLook` | `true`; `false` refuses the agent's `set_look`                                                 |

## The charm's look (spec 014)

charmd builds the look from the `charm` block at start and sends it as `charm:look` right before every `charm:unlocked` (PIN, admin unlock, repeated unlock); the charm keeps it only in memory. The admin action `look` changes it live:

- Request: `{"cmd": "look", "name"?, "colour"?, "greeting"?, "sleepAfterMinutes"?, "motion"?, "source"?: "agent"}` (unknown fields are refused). With no look fields it changes nothing and returns the current look.
- It merges the change, checks it against the protocol's schema (the old look stays on any error), sends it to every unlocked charm, and answers with the whole look: `{"name", "colour", "glyph", "greeting", "sleepAfterMinutes", "motion", "connected"}` (`connected`: charms it was sent to).
- `"source": "agent"` (the `set_look` tool) is refused when `agentCanChangeLook` is false. Nothing is written to `opencharm.json`: a change lasts until charmd restarts. From the shell: `opencharm look [--colour c] [--greeting "…"] [--motion full|calm]`.

Use `acp` when charmd can start the agent on the same machine as you (Claude Code, Codex, Gemini CLI, a local Hermes or OpenClaw). Use an HTTP adapter when the agent runs behind a user boundary, like the droplet (`docs/deploy.md`): there charmd must not start the agent under its own user. Every ACP session also gets the charm's own tools, an MCP server (`opencharm mcp`: `say`, `show_face`, `ask`, `notify`, `set_look`; `"charmTools": false` turns it off). ACP permission requests become a question on the charm (hold = yes, press = no; silence for 30 s = no); answers are always "once".

## Agents (spec 010)

One rule, standards only. charmd talks to an agent over **ACP** (Agent Client Protocol, agentclientprotocol.com, v1 over stdio, official SDK) whenever it can start the agent itself: `"agent": { "adapter": "acp", "agent": "claude" }` (also `codex`, `gemini`, `goose`, `hermes`, `openclaw`; adapters pinned to exact versions) or `"command": [...]` for any ACP agent, with `cwd` (default: the config's folder), optional `projects` (extra folders, ACP `additionalDirectories`) and `mode` (an ACP session mode). When the agent runs behind a user boundary (the droplet, spec 007: charmd must not start Hermes under its own user), charmd uses the agent's HTTP API instead (`hermes`, `openclaw`, `openai-compatible`). Messages are marked as coming from OpenCharm voice.

- `acp`: one agent process for charmd and one ACP session per charm, started as soon as the key is held and restarted after a crash. Replies stream into speech; text on either side of a tool call gets a line break; a key press sends `session/cancel`. charmd offers the agent no file or terminal access (it uses its own tools) and sends real folder paths (macOS `/tmp` is `/private/tmp`).
- A permission request during a turn becomes a question on the charm ("Claude Code wants to write ../notes.md."; spec 011): yes → `allow_once`; no, silence (30 s), a cancelled turn or a lock → `reject_once`. Outside a turn nobody can answer, so it's refused and logged. Answers are always "once": a yes or a no never becomes a lasting rule inside the agent.
- The `claude` preset (Claude Code through `@agentclientprotocol/claude-agent-acp`, on the user's own Claude login) loads only the workspace's settings (`settingSources: ["project", "local"]`, so none of the user's plugins, hooks or MCP servers) and asks for the `acceptEdits` mode explicitly: Claude Code ignores a folder's own escalating `defaultMode` until the user trusts the folder. The workspace's deny rules still apply. It also turns off the user's claude.ai connectors (`ENABLE_CLAUDEAI_MCP_SERVERS=0`; Gmail, Drive and the like reached the voice agent otherwise).
- Sessions stay in the agent: Hermes via `/v1/responses` with `conversation: "opencharm-<charm id>"`; OpenClaw (Gateway) via `user: "opencharm-<charm id>"`; ACP agents via one ACP session per charm, held in memory for as long as charmd and the agent process run (no `--resume`).

## The charm's tools for the agent (spec 012)

The charm is an **MCP server** for the agent, `opencharm mcp` (stdio, no dependencies, protocol versions 2025-06-18 / 2025-03-26 / 2024-11-05), forwarding to charmd's admin socket. Tools: `say` (speak now, unprompted), `show_face` (an agent state with an optional line), `ask` (a yes/no question on the charm; returns yes or no), `notify` (the orange "it needs you" with a line, until a press) and `set_look` (spec 014: colour, greeting or calm motion, never the name; a try-on until charmd restarts, off with `charm.agentCanChangeLook: false`). They act on the connected, unlocked charm (the newest if several).

- charmd adds the server to every ACP session (`mcpServers`, stdio; `"charmTools": false` turns it off). The `claude` preset lets Claude Code use it without asking (`allowedTools: ["mcp__charm"]`: Claude Code's allow rules in settings don't reach MCP tools through the ACP adapter).
- Agents that run as the same user as charmd but outside ACP can add `opencharm mcp --config <file>` to their own MCP settings. Never across a user boundary (the droplet): `opencharm mcp` talks to the admin socket, which can also unlock a charm without its PIN; a tools-only socket comes before that.
- During a turn: a face is kept when the turn ends, a question pauses the turn's clock, and `say` is refused (it would cut the reply that asked for it).
- Later: readable signals (picked up, face-down, home/away, battery); a "charm" skill for Hermes and OpenClaw.

## Voice

- `local`: macOS `say` speaks (in English by default: voice Samantha, whatever the system language; `voice.sayVoice` picks another installed voice), whisper.cpp (`whisper-cli`, model `~/.opencharm/models/ggml-base.en.bin`) listens; everything stays on the machine.
- `openai` (see "Research notes" below): Opus packets are forwarded, never decoded. The charm's 16 kHz packets are wrapped in Ogg for speech-to-text; text-to-speech Ogg Opus is unwrapped into packets the charm plays at 24 kHz (Opus is sample-rate independent). Defaults (unverified until a key is used): `gpt-4o-mini-transcribe` for speech-to-text, `gpt-4o-mini-tts` with `response_format: "opus"` for text-to-speech.
- Only the `local` and `fake` voices decode and encode Opus (`opusscript`), because `say` and whisper.cpp work on PCM.

## A turn (spec 003)

Key held → `listening` face; released → `thinking` face → Ogg → speech-to-text → `stt` (text shown briefly) → the agent streams → split into sentences → text-to-speech per sentence, each with `tts sentence_start` (synthesis of the next overlaps playback of the current; Opus frames paced at real time with a 3-frame lead) → `tts stop` → `idle`. The first sentence plays while the agent is still writing.

- Abort or a new key hold cancels everything in flight. Nothing heard → `idle` without asking the agent.
- Failures: agent unreachable or an error → `failed` face + one line ("Can't reach Hermes"); no reply within 60 s → `failed`. "I'll tell you when it's done" arrives with notifications (post-MVP).
- Speaking is not a face: charmd sends `tts start`/`stop` and the charm shows its speech layout. The agent can set a face at any time (`show_face`).
- Audio frames share the per-connection queue with text, so a frame sent right after `listen start` is never dropped.
- Each turn logs one JSON line (`sttMs`, `firstAudioMs`, `totalMs`, `outcome`; key released → first audio played); transcripts only with `logTranscripts: true`.

**Measured** on a MacBook (1 October 2026), `local` voice + Claude Code over ACP: speech-to-text about 0.6 s; key released → first audio about 3.1 s warm with the default model, 2.6 s with `"model": "haiku"` in the home's settings; 6.7–8 s for the first turn after charmd starts (the first run ever also downloads the adapter, about 18 s). Turns that use tools (writing a note) take 4–9 s. OpenAI voice and Hermes are not yet measured (no key or install here). Targets are in [OPENCHARM.md](../../OPENCHARM.md) ("Speed budget").

**At rest**: charmd does no work between turns. Its only timer is one WebSocket ping every 30 s for all connections. A charm that stops answering (out of Wi-Fi, a laptop asleep) is dropped instead of holding its session. Measured on the desktop charm (1 October 2026): 0% CPU.

## Workspace (spec 004)

A local agent needs a folder to work in. It comes from **opencharm-starter** (github.com/opencharm-labs/opencharm-starter, a template repo and the single source of truth): `opencharm init [dir] [--agent claude|codex|…] [--from <git url>]` clones it (keeping it as the `upstream` remote, so `git pull upstream main` brings fixes) and fits `opencharm.json` to the machine; or "Use this template" on GitHub. Then `opencharm serve` inside it. Server agents (Hermes, OpenClaw) keep their own homes and don't need one. Two audiences, two places:

- The root is for the developer and their coding agent: `AGENTS.md`, skill `customise-charm`, `opencharm.json` (the agent runs in `charm/`), tests (`node --test`) and CI.
- `charm/` is the voice agent's workspace: its persona (`AGENTS.md`, default name Momo), skills `charm-voice` and `charm-workspace`, `notes/` (what it was asked to remember) and `.claude/settings.json` (Claude Code's rules; other agents use their own permission settings).
- charmd's state stays in its default place, `~/.opencharm/`, outside the repo.

The voice agent's permission posture is pinned by the starter's tests:

- `defaultMode: "acceptEdits"`, so edits are accepted inside `charm/` only. A voice turn can't approve anything else, so it's refused.
- Denied: `Bash`, its own rules (`AGENTS.md`, `CLAUDE.md`, `.claude/`, `.agents/`) and charmd's state (`Read(~/.opencharm/**)`, `Edit(~/.opencharm/**)`). Anything else outside `charm/` needs permission, asked on the charm (spec 011). Claude Code doesn't match `../` paths in rules (it asks instead); `~/` paths it does.
- Verified with real Claude Code over ACP on 1 October 2026, in a clone made by `opencharm init`: a note is written to `charm/notes/` and recalled; editing `AGENTS.md` fails with "denied by your permission settings"; the shell tool isn't offered; reading or writing `~/.opencharm/` is denied; writing outside `charm/` asks and is refused. A coding agent at the repo root can rename the charm.

## Rules that must hold

- Every new connection starts locked; the PIN is checked here, never on the charm.
- PINs are 4–12 digits, set with `opencharm pair` (asked twice, typed without echo), stored as scrypt (N=2^15, r=8, p=1, 16-byte salt).
- Every new connection starts locked, including reconnects after a Wi-Fi drop; charmd keeps no unlocked state across connections.
- `opencharm unlock <charm>` clears a block and unlocks the connected session; `lock` locks it (`reason: remote`, effective within 2 s); `revoke` deletes the record, sends `revoked` and closes.
- The CLI reaches the running daemon through a local admin socket (mode 0600; a named pipe on Windows) next to the state file. The socket also stops a second charmd from using the same state.
- charmd binds `127.0.0.1:8787` by default; a non-loopback address needs `"allowInsecureRemote": true`. `/ota/` tells charms the WebSocket URL (`publicUrl`, or the local one).
- Five wrong PINs block the charm until `opencharm unlock <charm>`; the block survives reconnects and restarts.
- Nothing but `hello` and `unlock` is acted on before a charm is unlocked; `listen` and audio get `locked` back.
- Unknown tokens get `revoked` and close 4001; frames over the limits close 1009; unpaired sockets close after 120 s.
- Tokens never travel in URLs: the charm sends `Authorization: Bearer`, the emulator the `opencharm.token.<token>` WebSocket subprotocol (behind Caddy every client looks like loopback).
- charmd listens on loopback only; TLS is Caddy's job. Server install: `opencharm setup`, guide in `docs/deploy.md`.

## Develop

```bash
npm test -w packages/charmd      # unit + integration tests (a fake charm over a real socket)
npm run cli -- serve             # run it from source (config: ./opencharm.json or defaults)
npx tsx packages/charmd/scripts/smoke-turn.ts ws://127.0.0.1:8787/charm <token> <pin> "What time is it?" out.wav   # one real turn, no charm needed (macOS)
```

`src/test-support/fake-charm.ts` is the device side of the protocol for tests. Push faces, lines and questions to a connected charm with `opencharm dev face|say|ask`.

## Install

`npm i -g opencharm` (published from `cli-release.yml`, with provenance). On a server, `sudo opencharm setup --domain <d> [--dry-run]` creates the `charmd` user, `/var/lib/charmd`, `/etc/opencharm`, a systemd unit, and prints the Caddy block: [docs/deploy.md](../../docs/deploy.md).

## Prior art

| Piece                              | Use                                                               | Link                                                                   |
| ---------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| xiaozhi-esp32 protocol docs        | The device-side protocol                                          | <https://github.com/78/xiaozhi-esp32/blob/main/docs/websocket.md>      |
| xiaozhi-esp32-server (MIT, Python) | Reference for the protocol and OTA endpoint (not a base: too big) | <https://github.com/xinnan-tech/xiaozhi-esp32-server>                  |
| xiaozhi-openclaw-voice-terminal    | XiaoZhi talking to the OpenClaw Gateway                           | <https://github.com/erforschtbot-cmyk/xiaozhi-openclaw-voice-terminal> |
| Hermes Familiar (MIT)              | ESP32-S3 display as a Hermes gateway plugin                       | <https://github.com/webdevtodayjason/hermes>                           |
| hermes-embodiment (MIT)            | Hermes lifecycle events → face states                             | <https://github.com/teknium1/hermes-embodiment>                        |

## Research notes (30 September 2026)

What the audio spike found, before charmd's voice and agent code was written. The OpenAI and Hermes parts come from their docs and haven't been called with a key yet.

- **Audio path.** The charm's 60 ms Opus packets (16 kHz) go into an Ogg Opus file without decoding: RFC 7845, pre-skip 312, granule positions from each packet's TOC byte (`src/audio/ogg-opus.ts`, tested against ffmpeg in both directions). Opus packets don't depend on the sample rate: a packet encoded at 16 kHz decodes at 24 kHz to the same duration. So text-to-speech output in any Opus frame size can go to the charm as it is, with no resampling in charmd. `opusscript` (libopus in WebAssembly, no native build) encodes and decodes on Node 24.
- **OpenAI.**
  - Speech-to-text: `POST /v1/audio/transcriptions` accepts `ogg`; `gpt-4o-mini-transcribe`, or `gpt-4o-transcribe` for higher accuracy.
  - Text-to-speech: `POST /v1/audio/speech` with `response_format: "opus"` and chunked streaming; `gpt-4o-mini-tts`, 13 voices (default `alloy`).
- **Hermes.**
  - The API server listens on `127.0.0.1:8642` with `API_SERVER_KEY` as a bearer token.
  - Chat Completions needs the full `messages` array. The Responses API chains turns itself (`conversation: "<stable name>"` or `previous_response_id`).
  - The `hermes` adapter uses `/v1/responses` with `conversation: "opencharm-<charm id>"` plus `X-Hermes-Session-Key`, so charmd stays stateless.
  - Streams send `hermes.tool.progress` events and a keepalive comment every 10 s.
- **OpenClaw.** The Gateway's `/v1/chat/completions` takes model `openclaw:<agentId>` and a bearer token. It derives a stable session from the OpenAI `user` field, so charmd sends `user: "opencharm-<charm id>"`.
