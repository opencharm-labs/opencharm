# 014: Personalise your charm

Status: In progress
Depends on: 001, 002, 003, 004, 005, 013

## Why

A companion should feel like yours. Today every charm looks the same on screen (white glyphs), introduces itself the same way, and changing its voice means editing `opencharm.json` by hand. The maintainer wants as much personalisation as makes sense (2 October 2026). This spec makes the charm's identity one setting that every body follows: the board, the emulator and the desktop charm.

## Scope

- **The charm's identity**, stored once in the workspace's `opencharm.json`, in a new `charm` block (validated with zod in charmd). It holds:
  - `name`: up to 12 characters; default: the first heading of the agent's `AGENTS.md` (Momo in the starter)
  - `colour`: one of the six identity colours (White, Cobalt, Lime, Lilac, Sun, Coal; `packages/design`), whose glyph colour the glyphs light up in; or a colour of your own as `#RRGGBB`, used as it is for the glyphs. An own colour is refused when it's too dark to read on true black (relative luminance under 0.05) or could pass for the signal orange (a bright, saturated red-orange to orange, hue 6–40°, so every named orange); charmd and the app check the same rule
  - `greeting`: the line after unlock; default "Hi! I'm {name}."
  - `sleepAfterMinutes`: how long alone before it dozes; default 4, 0 = never
  - `motion`: `full` (default) or `calm`, which keeps breathing and blinks but no glances or squash, for people who prefer less movement
  - `volume`: how loud the charm's speaker is, 0–100; default 85
- **charmd sends it** to a charm after unlock, in a new message `{"type":"charm","op":"look", name, glyph, greeting, sleepMs, motion, volume}` (`volume` optional, so a charm keeps its own when an older charmd leaves it out) (packages/protocol, with fixtures for both sides), and again whenever the config changes while running.
- **OpenCharm OS applies it** at runtime: the glyph colour (eyes, mouth, z's; orange stays reserved for "it needs you"), the greeting text, the sleep delay, calm motion and the speaker's volume (through the HAL's `set_volume`: the board's codec, a gain on playback in the emulator and the desktop charm; 85 until a look says otherwise). The emulator and the desktop charm get it for free, since they run the same core.
- **Voice**: the local voice's macOS voice (`sayVoice`, Samantha when unset, so English text never gets the system language's voice) gets a picker. The OpenAI voice already has `voice` (13 voices); it gets a picker too.
- **The desktop charm's Settings, "Your charm"** (spec 013's settings window):
  - name, colour (the six swatches, and a seventh that opens the system colour picker, with a field to type `#RRGGBB`), greeting, voice (the macOS voices that speak the system language, with a "Try it" button), volume (a slider, 0–100), sleep delay, calm motion
  - changes are written to the workspace's `opencharm.json` and applied at once
  - for a folder that isn't a workspace, they're kept in the app's own config instead
- **The agent can change its own look** through a new charm tool, `set_look` (spec 012), within the same limits: for example, "make yourself blue" (or "speak more quietly") works by voice.
- **The CLI**: `opencharm init --name <name> --colour <colour>` sets them in a new workspace; `opencharm look --volume <0-100>` changes the volume until charmd restarts, like the other `look` flags.

## Decisions

- One source of truth per workspace (`opencharm.json`), so the board, the emulator and the desktop charm agree, and the identity travels with the workspace (maintainer, 2 October 2026).
- The name is what the charm shows; it doesn't rename the agent's persona file (maintainer, 2 October 2026).
- Any colour, not only the six: a swatch for the system picker and a hex field, kept simple (maintainer, 5 October 2026). Orange and colours too dark to see stay refused (the face rules).
- The agent may change its own look with `set_look`, as a try-on until charmd restarts; `agentCanChangeLook: false` turns it off (maintainer, 2 October 2026).
- Orange is never an identity colour: on screen it only means "it needs you" (OPENCHARM.md, the face rules).
- The speaker's volume is part of the look: one setting in `opencharm.json`, 0–100, default 85 (the board was fixed at 70 before), sent with the look and applied at once, also by the agent's `set_look` (maintainer, 13 October 2026). The guided setup doesn't ask for it: its "Your charm" step is the name and colour. The desktop app writes `volume` only when it differs from 85, and sends it only to an `opencharm` that knows it (its help shows `--volume`): an older one refuses keys it doesn't know, which would stop charmd or drop the whole look (review, 13 October 2026).
- The charm holds the look only in memory; charmd sends it before every unlock. Nothing new is stored on the device (the board keeps no settings beyond its token).

## Not in scope

- Custom glyph faces (drawing your own eyes and mouth): a later step, after the face library format is settled.
- Sounds and haptics (the board has no sound effects yet).
- Per-state colours, or colour anywhere except the glyphs.
- The website's configurator (spec 008), which already previews colour, name and face.

## Acceptance

- [x] `opencharm.json` accepts the `charm` block; invalid values are refused with a clear message (charmd config tests).
- [x] `charm:look` is in packages/protocol with valid and invalid fixtures, read by both the TypeScript and the C++ tests.
- [x] The core applies the glyph colour, greeting, sleep delay and calm motion at runtime (UI tests with screenshots for a Cobalt and a Coal charm).
- [ ] Changing the colour in the desktop charm's Settings recolours the charm by the notch within a second, without re-pairing (verified in the built app).
  - Verified on 2 October 2026 in the built app (test mode, fake agent): the look arrives before `unlocked`, and a live change through the admin socket (the path Settings uses) reaches the charm without re-pairing. It was also shown on screen in the emulator: Cobalt with "Hi! I'm Momo." from the workspace, then Lime live. The click in the Settings window itself is left for the maintainer's run.
- [x] The volume: `volume` in the `charm` block, in `charm:look` (optional; valid and invalid fixtures on both sides), applied through the HAL's `set_volume` (core tests), in `set_look`, `opencharm look --volume` and the desktop Settings slider (charmd, CLI, MCP and the app's Rust tests).
- [ ] The volume slider in the desktop charm's Settings changes how loud the charm by the notch speaks, and the board's speaker follows a change mid-reply (verified in the built app and on the board).
- [ ] The voice picker lists the installed macOS voices and "Try it" speaks a sample; the chosen voice is used for the next answer.
- [ ] Saying "make yourself blue" to an agent with the charm tools changes the colour (fake ACP agent test, then a real run by the maintainer).
  - `set_look` through the real `opencharm mcp` server changed the running app's charm to Lilac with a new greeting (2 October 2026). Saying it by voice to Claude Code is the maintainer's run.
- [x] `opencharm init --name Momo --colour lilac` writes the block.
- [x] A colour of your own: `#RRGGBB` in `opencharm.json`, `set_look` and `opencharm init --colour`; too dark or too orange is refused with a clear message (charmd look and config tests, the app's settings tests, the MCP server test).
- [ ] Picking and typing an own colour in the desktop charm's Settings recolours the charm by the notch (verified in the built app).
- [x] Docs: OPENCHARM.md (the face, colour identity), the protocol README, the charmd README, the desktop README; `npm run check` green.
