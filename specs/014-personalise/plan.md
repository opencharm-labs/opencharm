# 014 plan: personalise your charm

Spec: `specs/014-personalise/spec.md` (approved 2 October 2026: the name doesn't rename the persona file; the agent may change its look, with an off switch). Branch `spec/014-personalise`.

## Contract (done first, shared by every task)

`packages/protocol`: server message `charm:look` with fixtures (`fixtures/valid/server-charm-look*.json`, `fixtures/invalid/server-look-*.json`):

```json
{
  "type": "charm",
  "op": "look",
  "name": "Momo",
  "glyph": "#9DB6FF",
  "greeting": "Hi! I'm Momo.",
  "sleep_ms": 240000,
  "motion": "full"
}
```

- `name`: 1–12 characters, ≤ 24 bytes
- `glyph`: `#RRGGBB`, never the signal orange `#FF5A1F`
- `greeting`: ≤ 40 bytes; may be empty (then the face says nothing)
- `sleep_ms`: 0 (never) to 86 400 000
- `motion`: `full` or `calm`

charmd sends it right **before** `charm:unlocked` on every unlock, and to every unlocked session when the look changes.

## Task A: OpenCharm OS (firmware core, C++)

- `protocol.cpp`: parse `look` into a `Look` struct (the same validation as the fixtures; invalid → ignored like other bad input). The fixture tests must pass.
- `View`: `set_look(uint32_t glyph, bool calm)`. `LvglView` recolours the eyes, mouth and z's at runtime (never the orange ring). In calm motion: no glances, no squash, no voice swell; breathing and blinks stay.
- `App`: keeps `greeting` and `sleep_ms` from the look. The unlock greeting uses it (empty: no line), and the sleep timer uses `sleep_ms` (0 = never).
- Tests: app tests for greeting, sleep and calm; UI tests with screenshots of a Cobalt (`#9DB6FF`) and a Coal (`#F4F3EE`) charm, checking the glyph pixels' colour.
- Then `npm run firmware:sim` rebuilds the emulator.

## Task B: charmd, the CLI and the charm tools (TypeScript)

- **Config** (`config.ts`): an optional `charm` block:
  - `name` (≤ 12)
  - `colour` (white | cobalt | lime | lilac | sun | coal, from `@opencharm-labs/design` faces.json)
  - `greeting` (≤ 40 bytes)
  - `sleepAfterMinutes` (0–1440, default 4)
  - `motion` (full | calm, default full)
  - `agentCanChangeLook` (default true)

  The default name is the first `# ` heading of `AGENTS.md` in the ACP agent's `cwd`, else "Charm". The default greeting is `Hi! I'm {name}.`

- **The look in charmd:** built from the config at start (`src/look.ts`, pure, tested). Sessions send `charm:look` before `charm:unlocked`.
- **Admin action `look`:** `{"cmd":"look", "name"?, "colour"?, "greeting"?, "sleepAfterMinutes"?, "motion"?, "source"?: "agent"}`.
  - It merges, validates, broadcasts to unlocked sessions, and returns the full look.
  - With `source: "agent"` it's refused when `agentCanChangeLook` is false.
  - It doesn't write any file: the agent's change is a try-on until charmd restarts.
  - `{"cmd":"look"}` with no fields returns the current look.
- **Charm tool** `set_look` in `opencharm mcp`, with `colour`, `greeting` and `motion` (not the name): it calls the admin `look` with `source: "agent"`.
- **CLI:** `opencharm init --name <n> --colour <c>` writes the `charm` block; `opencharm look [--colour …]` uses the admin action.
- **Tests:** config, look defaults (heading, greeting), the order of messages on unlock, the admin broadcast, refusal of agent changes when switched off, and the MCP tool.
- **Docs:** packages/charmd/README.md, packages/protocol/README.md, OPENCHARM.md (colour identity).

## Task C: the desktop charm (Rust and web)

- **Settings model:** a `look` (name, colour, greeting, sleep minutes, motion, agent may change) and `say_voice`.
  - When the chosen folder is a workspace, they're read from and written to its `opencharm.json` (the `charm` block and `voice.sayVoice`), keeping every other key.
  - Otherwise they're kept in the app's settings.
  - `build_config` puts them in charmd's config.
- **Applying changes:** a look change is sent at once through the admin socket (`{"cmd":"look", …}`), with no restart. A voice change restarts the managed charmd.
- **Voices:** `list_voices` (parse `say -v '?'`: name, locale) and `try_voice(name, text)`, which only accepts a name from the list.
- **Settings UI, "Your charm" section:**
  - the name, the six colour swatches (from the design package), the greeting
  - the voice select with a Try button
  - sleep (minutes, or never), calm motion, and "Let the agent change its look"
  - every change is saved and applied, with the same style as the rest of the window
- **Tests:** Rust tests for reading and writing the workspace block (other keys untouched) and for parsing the voice list.
- **Visual check:** screenshots of Settings.

## Integration (after A, B and C)

- Merge them, rebuild the emulator and the app.
- In the built app (test mode, the fake agent): change the colour, and the charm by the notch recolours within a second, without re-pairing.
- The fake ACP agent's `set_look` changes it too.
- Screenshots; `npm run check`, firmware tests, Rust tests; docs.
