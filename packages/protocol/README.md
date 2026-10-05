# @opencharm-labs/protocol — charm ↔ charmd messages

The contract between a charm (or the emulator) and charmd: zod schemas (`src/messages.ts`), limits (`src/constants.ts`), a parser that never throws (`src/parse.ts`; errors: `too_large`, `invalid_json`, `unknown_type`, `unknown_op`, `invalid_fields`) and one JSON fixture per message in `fixtures/` (`valid/`, `invalid/`), shared with the C++ core in `firmware/core`. Overview: [OPENCHARM.md](../../OPENCHARM.md) "Protocol"; skill `opencharm-protocol`.

We speak xiaozhi-esp32's WebSocket protocol and add one namespaced message type for everything that is ours. This keeps the fork's transport untouched and lets stock XiaoZhi devices talk to charmd.

## Connection

`wss://<host>/charm` with headers `Authorization: Bearer <token>` (absent before pairing), `Device-Id`, `Client-Id`, `Protocol-Version`. The address comes from the charm's setup; the charm fetches it through XiaoZhi's config check endpoint, which charmd serves at `/ota/` (the same endpoint will serve firmware updates later). Browsers can't set headers on a WebSocket, so the emulator offers the subprotocols `opencharm` and `opencharm.token.<token>`; tokens never travel in URLs.

## Kept from XiaoZhi

| Message                                              | Direction | Use                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hello`                                              | both      | Session start and audio parameters. Our charm adds `"opencharm"` to `features`, and may say what it runs: `build: { kind, version, commit }` (`emulator`, `desktop`, `board`; spec 015). charmd's says what it accepts beyond XiaoZhi: `features: { text: true }` (typed text) |
| `listen` `start`/`stop`, `mode: "manual"`            | charm →   | Key held / released                                                                                                                                                                                                                                                            |
| `abort`                                              | charm →   | Press while speaking = stop                                                                                                                                                                                                                                                    |
| binary Opus                                          | both      | Up: 16 kHz mono, 60 ms frames. Down: 24 kHz (from the upstream board configs)                                                                                                                                                                                                  |
| `stt`                                                | → charm   | What it heard                                                                                                                                                                                                                                                                  |
| `tts` `start` / `sentence_start` (+ `text`) / `stop` | → charm   | Speaking; the line types out while the mouth flaps                                                                                                                                                                                                                             |
| `llm` `emotion`                                      | → charm   | Only for stock XiaoZhi devices                                                                                                                                                                                                                                                 |

## Ours: `{"type": "charm", "op": ...}`

| op                                                 | Direction | Meaning                                                                                                                                                  |
| -------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pair_code` `{code, expires_in}`                   | → charm   | Show this 6-digit code (made by charmd, valid 300 s)                                                                                                     |
| `paired` `{token}`                                 | → charm   | Store the token in flash; show the PIN pad                                                                                                               |
| `unlock` `{pin}`                                   | charm →   | PIN attempt                                                                                                                                              |
| `unlocked`                                         | → charm   | Go to the face                                                                                                                                           |
| `locked` `{reason, tries_left}`                    | → charm   | `reason`: `boot`, `wrong_pin`, `remote`, `blocked`                                                                                                       |
| `revoked`                                          | → charm   | Delete the token; back to pairing                                                                                                                        |
| `face` `{state}`                                   | → charm   | A state id from `packages/design/faces.json` (the glyphs live on the charm)                                                                              |
| `ask` `{id, text, yes?, no?}`                      | → charm   | A question (≤ 200 characters) in the decision layout; labels ≤ 12 characters, default ALLOW / NO (spec 011)                                              |
| `ask_end` `{id}`                                   | → charm   | The question is gone (timed out, turn cancelled): back to the face                                                                                       |
| `answer` `{id, yes}`                               | charm →   | Hold = yes (at 200 ms, never opens the mic), press = no                                                                                                  |
| `text` `{text}`                                    | charm →   | Typed text from the desktop charm (spec 013), at most 2,000 characters; answered as text. Only to a charmd whose `hello` says `features: { text: true }` |
| `look` `{name, glyph, greeting, sleep_ms, motion}` | → charm   | The charm's identity (spec 014): sent right before every `unlocked`, and again when it changes                                                           |

`look` limits: `name` 1–12 characters (≤ 24 bytes); `glyph` a `#RRGGBB` colour, never the signal orange `#FF5A1F`; `greeting` ≤ 40 bytes, empty means the face says nothing; `sleep_ms` 0 (never) to 86 400 000; `motion` `full` or `calm` (breathing and blinks, no glances or squash). The charm keeps the look in memory only.

`face.state` is an agent state id from `packages/design`; "speaking" is not a face: the charm shows its speech layout between `tts start` and `tts stop`. `face` may carry a short `text` (≤ 200 characters) shown without speech, e.g. "Can't reach Hermes". PINs are 4–12 digits.

Post-MVP ops slot into the same type: `notify`, `signal`, `permissions`.

## Rules

- Until `unlocked`, charmd ignores `listen` and audio and answers `locked`.
- The PIN is set at pairing, typed into `opencharm pair`; it is never stored on the charm.
- charmd stores only hashes: SHA-256 of tokens, scrypt (salted) of PINs, using Node's built-in `crypto`.

## Develop

```bash
npm test -w packages/protocol
```

A new or changed message needs its schema, a fixture in `fixtures/valid` (and a bad one in `fixtures/invalid` where useful), and the C++ side in `firmware/core`, which reads the same fixtures.
