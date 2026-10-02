# 003: Voice and agent turns

Status: Done
Depends on: 002

## Why

The core loop: hold the key, speak, hear your agent answer. charmd stays thin: it moves audio and text and never decides behaviour.

## Scope

- **`audio/`:** Ogg Opus wrap and unwrap (our own code).
- **`voice/`:** the speech-to-text and text-to-speech interface; providers `openai`, `local` (on this computer: whisper for listening, the system voice for speaking) and `fake` for tests.
- **`agent/`:** the adapter interface, with a stable session per charm and messages marked as OpenCharm voice:
  - `openai-compatible` (streaming chat completions)
  - `hermes` (Hermes' Responses API on `http://127.0.0.1:8642/v1` by default, a stable session key per charm)
  - `openclaw` (`openclaw:<agentId>`, the Gateway token)
  - `acp`, for Claude Code and other ACP agents (spec 010)
  - `fake` for tests
- **The turn** (`turn/turn.ts`): `listen stop` → Ogg → speech-to-text → `stt` → the agent's stream → a sentence splitter → speech per sentence → `tts sentence_start` and Opus frames → `tts stop`. Faces follow the turn: `listening`, `thinking`, `speaking`, `failed`, `idle`. `abort` stops it; a timeout gives `failed`.
- **Timing log:** key released → first audio frame sent.
- **Dev commands:** `opencharm dev face|say|lock` push messages to a connected charm through the admin socket.
- **Privacy:** no audio written to disk; transcripts are not logged unless `logTranscripts: true`.

## Not in scope

MCP charm tools (012), the permissions engine and questions on the charm (011), notifications.

## Acceptance

- [x] A full turn with a fake charm, fake voice and fake agent: faces arrive in order listening → thinking → speaking → idle, audio frames arrive, and the first sentence is sent before the agent's stream ends.
- [x] Agent unreachable → the `failed` face and a text line without speech; timeout → `failed`.
- [x] `abort` stops speech within one frame.
- [x] A manual smoke test on localhost: charmd, Claude Code and the `local` voice, driven by `packages/charmd/scripts/smoke-turn.ts`; a spoken question got a spoken answer, and a second turn remembered the first (30 September 2026).
- [ ] A manual smoke test against real OpenAI and Hermes, with the timing recorded in `OPENCHARM.md`. Deferred: needs an OpenAI key and a Hermes install; repeated in spec 007 (droplet deploy).

## Next

Not approved; to be measured first, then the two or three changes that matter most picked. Observed in the first real test on the maintainer's Mac (1 October 2026):

- **Slow to start talking:** about 3 s from releasing the key to the first word when warm, 7–8 s on the first turn, 4–9 s with a tool. Speech-to-text is about 0.6 s; then the agent's first sentence, then its synthesis.
- **Every exchange needs the key:** no natural back-and-forth ("And tomorrow?").
- **Long answers** are too long for a voice and a small screen, even with scrolling captions.
- **Language and voice don't match by default:** the system voice follows the Mac's language; the persona and whisper model are English.
- **Mishearing:** whisper `base.en` gets names and short commands wrong ("hello world" → "lowered").
- **Memory is a notes file:** the conversation ends when charmd restarts (a new ACP session).
- **No quality measure:** timings are logged, not misheard, interrupted, too long or failed turns.

Proposals:

- Latency: stream speech-to-text while the key is held; synthesise from the first clause; keep the agent warm; a faster model for voice with a smarter one on request; measure each stage per turn.
- Turn-taking: a short follow-up window after an answer (press once to answer back); "Hmm…" fillers or a thinking sound for slow answers. Barge-in already works: a hold interrupts.
- Answer shape: voice-first answers by default (one or two sentences, offer more); a "tell me more" gesture; long content to the screen or a file.
- Language: one setting for listening, persona and voice (English or Italian first), checked by `opencharm init`.
- Recognition: a bigger or multilingual whisper model; a vocabulary hint from the workspace; confirm before acting on a misheard command.
- Continuity: resume the agent's session across restarts (ACP `session/load` where offered) or summarise into notes.
- Quality: a per-turn record (heard, interrupted, length, time to first word) without transcripts by default, and scripted conversations to replay in tests (fake voice, real agent).
- Wake words stay out: the mic opens only while the key is held, by design.
