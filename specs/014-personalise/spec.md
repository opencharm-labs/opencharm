# 014: Personalise your charm

Status: In progress
Depends on: 001, 002, 003, 004, 005, 013

## Why

A companion should feel like yours. Today every charm looks the same on screen (white glyphs), introduces itself the same way, and changing its voice means editing `opencharm.json` by hand. The maintainer wants as much personalisation as makes sense (2 October 2026). This spec makes the charm's identity one setting that every body follows: the board, the emulator and the desktop charm.

## Scope

- **The charm's identity**, stored once in the workspace's `opencharm.json`, in a new `charm` block (validated with zod in charmd). It holds:
  - `name`: up to 12 characters; default: the first heading of the agent's `AGENTS.md` (Momo, Pip…)
  - `colour`: one of the six identity colours (White, Cobalt, Lime, Lilac, Sun, Coal; `packages/design`); the glyphs light up in its glyph colour
  - `greeting`: the line after unlock; default "Hi! I'm {name}."
  - `sleepAfterMinutes`: how long alone before it dozes; default 4, 0 = never
  - `motion`: `full` (default) or `calm`, which keeps breathing and blinks but no glances or squash, for people who prefer less movement
- **charmd sends it** to a charm after unlock, in a new message `{"type":"charm","op":"look", name, glyph, greeting, sleepMs, motion}` (packages/protocol, with fixtures for both sides), and again whenever the config changes while running.
- **OpenCharm OS applies it** at runtime: the glyph colour (eyes, mouth, z's; orange stays reserved for "it needs you"), the greeting text, the sleep delay and calm motion. The emulator and the desktop charm get it for free, since they run the same core.
- **Voice**: the local voice's macOS voice (`sayVoice`) gets a picker. The OpenAI voice already has `voice` (13 voices); it gets a picker too.
- **The desktop charm's Settings, "Your charm"** (spec 013's settings window):
  - name, colour (the six swatches), greeting, voice (the macOS voices that speak the system language, with a "Try it" button), sleep delay, calm motion
  - changes are written to the workspace's `opencharm.json` and applied at once
  - for a folder that isn't a workspace, they're kept in the app's own config instead
- **The agent can change its own look** through a new charm tool, `set_look` (spec 012), within the same limits: for example, "make yourself blue" works by voice.
- **The CLI**: `opencharm init --name <name> --colour <colour>` sets them in a new workspace.

## Decisions

- One source of truth per workspace (`opencharm.json`), so the board, the emulator and the desktop charm agree, and the identity travels with the workspace (maintainer, 2 October 2026).
- The name is what the charm shows; it doesn't rename the agent's persona file (maintainer, 2 October 2026).
- The agent may change its own look with `set_look`, as a try-on until charmd restarts; `agentCanChangeLook: false` turns it off (maintainer, 2 October 2026).
- Orange is never an identity colour: on screen it only means "it needs you" (OPENCHARM.md, the face rules).
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
- [ ] The voice picker lists the installed macOS voices and "Try it" speaks a sample; the chosen voice is used for the next answer.
- [ ] Saying "make yourself blue" to an agent with the charm tools changes the colour (fake ACP agent test, then a real run by the maintainer).
  - `set_look` through the real `opencharm mcp` server changed the running app's charm to Lilac with a new greeting (2 October 2026). Saying it by voice to Claude Code is the maintainer's run.
- [x] `opencharm init --name Momo --colour lilac` writes the block.
- [x] Docs: OPENCHARM.md (the face, colour identity), the protocol README, the charmd README, the desktop README; `npm run check` green.
