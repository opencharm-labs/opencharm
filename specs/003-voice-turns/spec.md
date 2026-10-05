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

### Voice that sounds right (approved by the maintainer, 4 October 2026)

Listening and speaking are the main way to use the charm, so the defaults must be the best quality we can give with no key and no setup; every choice can be changed in Settings. Evidence: the voice spike in `packages/charmd/README.md` ("Research notes, 4 October 2026").

- **Listening and speaking are chosen separately:** `voice.listen` and `voice.speak` in the config, each with its provider; an existing `voice.provider` keeps working (read as both).
- **One local engine:** sherpa-onnx (`sherpa-onnx-node`, Apache-2.0) inside charmd, the models loaded once and kept in memory (no process per turn). Models are downloaded on first use into `~/.opencharm/models` from pinned URLs, checked against a SHA-256, with progress in the CLI and the desktop app; never inside the npm package.
- **Listening default: NVIDIA Parakeet TDT 0.6B v3** (int8, 643 MB on disk; CC-BY-4.0 and 25 European languages per its model card, unverified here), credited in the third-party notices. It transcribed English, Italian and a mix without being told the language, but returns no language id. Options: whisper.cpp (`local` today), OpenAI with the user's key.
- **Speaking default: Microsoft's neural voices through Edge's read-aloud service** (no key; Node client `msedge-tts`, MIT per its package), one voice per language: Ava Multilingual for English, Isabella for Italian; voices for other languages are picked from the same family when built (untested). Settings and the docs say it plainly: the text of each spoken reply goes to Microsoft, and it's an unofficial service that may stop working. If it fails or is slow, charmd speaks that turn with the local voice, so the charm is never silent. Options: the local voice, macOS system voices, OpenAI with the user's key.
- **Local voice: Supertonic 3** (sherpa-onnx, 146 MB; 31 languages per its README), the private option and the fallback. It passed the maintainer's ear in English; in Italian no local voice did, so the Italian fallback is known to sound poor. Its weights' licence is confirmed before it ships (the package says MIT; one source says OpenRAIL-M).
- **The reply's language follows yours:** each sentence is spoken by the voice for its own language, guessed from its words (Parakeet gives no language id), keeping the one before it when unsure: first the transcript's, else a primary language in Settings. The agent isn't told: it already answers in the language it's spoken to, and a wrong guess would mislead it (changed while building, 4 October 2026).
- **It answers the way you asked:** a spoken question gets a spoken reply; a typed one (the desktop app, spec 013) gets a text reply. A **Speak replies** switch (`speakReplies` in charmd's config, default on; the desktop app sets it through the admin socket, applied from the next turn) makes every reply text only. The physical charm always listens and speaks: no typing, no silent mode on the device.
- **Text-only replies** use the same `tts start` / `sentence_start` / `stop` messages with no audio; charmd paces them, sending each `sentence_start` after the previous sentence's reading time (about 3 words a second, at least 2 s), so the charm needs no new logic; while a question is on the charm (the charm keeps the sentence and shows it again after) the reading time waits until the last question is answered, then goes on with what it had left; a press dismisses it.
- **Faster to the first word** (target: charmd's own share under 1 s when warm, that is speech-to-text plus the first audio once the agent's first clause arrives; the agent's own time, about 2–3 s with Claude Code today, is outside charmd): the models and the agent are warmed when the charm unlocks; the first clause is spoken as soon as it's long enough (about 20 characters at `,` `;` `:`); speech is streamed where the provider streams; the timing log has one line per stage (speech-to-text, the agent's first words, first audio).
- **No clipped first word:** the charm keeps the audio from the moment the key goes down, in memory, and sends it once the hold is confirmed (200 ms); a press throws it away and sends nothing. This changes the written mic rule ("the mic opens only while the key is held, after 200 ms") to "the mic is on only while the key is down; nothing leaves the charm unless it's a hold", in the firmware core (spec 005) and its tests. Never on a question (hold = yes).

## Not in scope

MCP charm tools (012), the permissions engine and questions on the charm (011), notifications. In the voice update: ElevenLabs and Azure as their own options (the `openai` voice takes any OpenAI-compatible service), follow-up listening, wake words, speech-to-speech models, voice cloning.

## Acceptance

- [x] A full turn with a fake charm, fake voice and fake agent: faces arrive in order listening → thinking → speaking → idle, audio frames arrive, and the first sentence is sent before the agent's stream ends.
- [x] Agent unreachable → the `failed` face and a text line without speech; timeout → `failed`.
- [x] `abort` stops speech within one frame.
- [x] A manual smoke test on localhost: charmd, Claude Code and the `local` voice, driven by `packages/charmd/scripts/smoke-turn.ts`; a spoken question got a spoken answer, and a second turn remembered the first (30 September 2026).
- [ ] A manual smoke test against real OpenAI and Hermes, with the timing recorded in `OPENCHARM.md`. Deferred: needs an OpenAI key and a Hermes install; repeated in spec 007 (droplet deploy).

Voice that sounds right:

- [x] Unit tests: the config (`listen`/`speak`, the old `provider` still read), the model download (pinned SHA-256, a bad file refused), the Microsoft client (token, escaping, WebM, errors), the fallback when a voice fails or has no audio within 3 s, the first-clause split, the reply's language choosing the voice.
- [x] Unit tests for text-only pacing: no audio and no synthesis, reading time per sentence, a press dismisses it; over a real socket, `speakReplies: false` shows text on the desktop charm while an emulator still speaks, and the admin command turns it back on.
- [x] Live, on the maintainer's Mac: Parakeet transcribed English and Italian questions word for word in 0.12–0.27 s, through charmd with Claude Code and Microsoft's voice (4 October 2026). The spike's own recordings weren't kept.
- [x] The maintainer's own voice, English and Italian, through the desktop app (`desktop@0.7.0`, 5 October 2026). Mixed Italian and English in one sentence: not tried yet.
- [x] The maintainer's listening check: the default voices in English and Italian pass (the blind test in `packages/charmd/README.md`, "Research notes, 4 October 2026", and `desktop@0.7.0`).
- [x] Measured on the maintainer's Mac (M2), per stage, in English and Italian: the voice's share about 0.6 s when warm (once 1.4 s, Microsoft's variance); recorded in `OPENCHARM.md` and `packages/charmd/README.md` (4 October 2026).
- [x] The core's tests: a press (under 200 ms) sends no audio; a hold sends the audio from key-down, after `listen start`, in order; a question arriving mid-press drops it; a press while it speaks doesn't listen; a hold on a question never opens the mic.
- [x] The first run downloads the models with progress, on macOS (charmd's own downloader, both models, checksums verified, 4 October 2026). Windows: with spec 013's Windows run; Linux: when a Linux charm is tried.
- [x] A typed question gets a text reply (unit and real-socket tests, and the emulator end to end in Chrome); with Speak replies off, a spoken question does too; the physical charm (emulator) always speaks.
- [x] The docs the change makes wrong are updated in the same PR: `OPENCHARM.md` (controls and the mic rule, charmd's voice plumbing, Security: what leaves the computer by default, the reply's text to Microsoft, and the CLI's new native and runtime dependencies), `firmware/README.md`, the website FAQ (`apps/web/src/app/_lib/faq.ts`), `apps/desktop/README.md`, CONTRIBUTING.

## Next

Not approved. Decided against (maintainer, 5 October 2026; the charm stays lean and works with any agent):

- **ElevenLabs and Azure as their own options:** any speech service that speaks the OpenAI API already works through the `openai` voice with its key, `baseUrl` and `model`.
- **A follow-up window after an answer:** the mic is on only while the key is held.
- **Memory across restarts:** it belongs to the agent (its own files and memory); charmd keeps one agent session per charm while it runs and adds none of its own.

Observed in the first real test on the maintainer's Mac (1 October 2026); latency, language and recognition are now in Scope above:

- **Slow to start talking:** about 3 s from releasing the key to the first word when warm, 7–8 s on the first turn, 4–9 s with a tool. Speech-to-text is about 0.6 s; then the agent's first sentence, then its synthesis.
- **Every exchange needs the key:** no natural back-and-forth ("And tomorrow?").
- **Long answers** are too long for a voice and a small screen, even with scrolling captions.
- **Language and voice don't match by default:** the system voice follows the Mac's language; the persona and whisper model are English.
- **Mishearing:** whisper `base.en` gets names and short commands wrong ("hello world" → "lowered").
- **Memory is a notes file:** the conversation ends when charmd restarts (a new ACP session).
- **No quality measure:** timings are logged, not misheard, interrupted, too long or failed turns.

Proposals:

- Latency: stream speech-to-text while the key is held; synthesise from the first clause; keep the agent warm; a faster model for voice with a smarter one on request; measure each stage per turn.
- Turn-taking: "Hmm…" fillers or a thinking sound for slow answers. Barge-in already works: a hold interrupts.
- Answer shape: voice-first answers by default (one or two sentences, offer more); a "tell me more" gesture; long content to the screen or a file.
- Language: one setting for listening, persona and voice (English or Italian first), checked by `opencharm init`.
- Recognition: a bigger or multilingual whisper model; a vocabulary hint from the workspace; confirm before acting on a misheard command.
- Quality: a per-turn record (heard, interrupted, length, time to first word) without transcripts by default, and scripted conversations to replay in tests (fake voice, real agent).
- Wake words stay out: the mic opens only while the key is held, by design.
