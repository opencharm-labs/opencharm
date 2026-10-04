# 003 plan: voice that sounds right

Built in pull requests that each work on their own. This plan lives until spec 003 is Done.

## PR A: charmd listens with Parakeet and speaks with Microsoft's voices (built)

1. **Config** (`config/config.ts`, `wiring.ts`): `voice` is either the old `{provider}` or `{listen, speak, language?}`.
   - `listen.provider`: `local` (Parakeet), `whisper` (the old local listening), `openai`, `fake`.
   - `speak.provider`: `microsoft` (Edge, default voices per language, `voices` to override), `local` (Supertonic 3), `system` (macOS `say`), `openai`, `fake`.
   - The old `{provider: "local"}` maps to listen `local` + speak `local` (private, as the word promised), or whisper / `say` when `whisperModel` / `sayVoice` are set. The old `openai` and `fake` map to both sides.
   - Tests: every shape parses, the old shapes map as above, unknown keys are refused.
2. **Models** (`voice/models.ts`): a registry of pinned archives (URL, SHA-256, size, folder). `ensureModel(id, onProgress)` downloads to a temp file, checks the SHA-256, extracts with the system `tar`, then renames the folder into `~/.opencharm/models`. Tests: a local HTTP server serves a small archive; a wrong hash is refused and leaves nothing behind.
3. **Local engine** (`voice/sherpa.ts`): `sherpa-onnx-node` loaded lazily (charmd still starts without it); Parakeet kept in memory for listening; Supertonic 3 for speaking, resampled to 24 kHz for Opus. Tests: unit tests with the engine stubbed; a real-model test skipped unless the models are present.
4. **Microsoft voice** (`voice/microsoft.ts`): our own small client on `ws` (no new dependency): the rotating `Sec-MS-GEC` token, `speech.config`, SSML with the text XML-escaped; the service refuses Ogg, so it sends WebM Opus at 24 kHz, read as it arrives (`audio/webm-opus.ts`) and streamed packet by packet (`voice/packets.ts`). Tests: a fake WebSocket server (headers, escaping, audio framing, `turn.end`, errors and timeout).
5. **Speaking with a fallback, by language** (`voice/speak.ts`, `voice/language.ts`): the reply's language from its words (stop-word scores for the languages with a voice, the turn's language when unsure), the voice for that language; on an error or no audio within 3 s, the local voice for that sentence, else `system` on macOS. Tests for each.
6. **The turn** (`turn/turn.ts`, `turn/sentences.ts`): the first clause goes out early (at `,` `;` `:` once it is 20 characters long); the voice is warmed with the agent; the timing log gains `agentFirstMs`. Tests.
7. **CLI** (`packages/cli`): `sherpa-onnx-node` as a runtime dependency, kept external in tsdown; `opencharm voice install` downloads the models with progress; `opencharm init` writes the new voice config; `opencharm status` shows the voice and any download in progress.
8. **Docs:** `OPENCHARM.md` (charmd's voice plumbing, Security: what leaves the computer, the dependencies), the website FAQ, `packages/charmd/README.md`, `packages/cli/README.md`, third-party notices (Parakeet CC-BY-4.0, Supertonic).

## PR B: no clipped first word (firmware core, spec 005)

The core keeps mic audio from key-down in memory and sends it when the hold is confirmed; a press drops it. Never on a question. doctest cases for press, hold and question; the emulator's mic opens at key-down. Docs: `OPENCHARM.md` controls, `firmware/README.md`.

## PR C: the desktop's voice settings (spec 013)

Listening and Speaking as two choices, the voice per language, the download's progress, the note on what Microsoft's voice receives. `managed.rs` writes `{listen, speak}`.

## Then

Text-only replies and the Speak replies switch (003), typing (013, 001), each with its own section here before it starts.
