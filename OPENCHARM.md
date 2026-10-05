# OpenCharm

This is what OpenCharm is today, for people and coding agents. Changes are proposed and recorded as numbered specs in `specs/` (index: [specs/README.md](specs/README.md)); git keeps the history. Component detail lives next to its code: [hardware/README.md](hardware/README.md), [firmware/README.md](firmware/README.md), [packages/charmd/README.md](packages/charmd/README.md), [packages/protocol/README.md](packages/protocol/README.md), [apps/desktop/README.md](apps/desktop/README.md), [docs/build.md](docs/build.md), [docs/deploy.md](docs/deploy.md) and [CONTRIBUTING.md](CONTRIBUTING.md). When code and this file disagree, flag it and fix one of them in the same change; never drift silently.

Licence of this document: CC BY-SA 4.0 (see README). Prices and specs were checked on 29–30 September 2026; anything marked _unverified_ needs a physical board or a build to confirm.

## 1. Status

| Area                                             | State                                                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Product definition, UX, face system              | Decided (this file)                                                                                                              |
| Face engine, browser reference                   | Done: `packages/design/src/charm-face.js`                                                                                        |
| Landing page                                     | Live at opencharm.dev: `apps/web` (spec 008), on Vercel                                                                          |
| Device + face prototype page                     | Done: `hardware/prototype/PROTOTYPE.html` (3D from the real STL files)                                                           |
| Brand: page look, app icon                       | Done: white and black pages; icon set in `brand/icon/`                                                                           |
| npm CLI (`packages/cli`)                         | TypeScript, tested, bundled; on npm with provenance (0.1.0, 3 October 2026), released from `main` on every merged fix or feature |
| Repo foundation (workspaces, checks, agents, CI) | Done                                                                                                                             |
| Enclosure v0.1                                   | STL files generated, **not yet printed or fitted**                                                                               |
| Hardware                                         | Reference board: Waveshare ESP32-S3-Touch-AMOLED-2.16                                                                            |
| Firmware, OpenCharm OS (`firmware/`)             | Core and emulator built (specs 005, 006); the board port (009) not started                                                       |
| charmd, the charm daemon                         | Built (specs 002, 003, 010, 011, 012); the droplet deploy waits for a droplet (007)                                              |
| Desktop charm (`apps/desktop`)                   | macOS app built (spec 013); Windows builds in CI, untested on a real machine                                                     |
| Build guide                                      | `docs/build.md`                                                                                                                  |

## 2. Principles and the moment of truth

The MVP is done when this works, first in the emulator, then on the reference board:

> Unlock the charm with a PIN → hold the key → ask Hermes (running on a DigitalOcean droplet) → hear the answer while the face goes listening → thinking → speaking → idle.

It must work anywhere the charm has Wi-Fi, including a phone hotspot. The full definition of done and how each part is tested: [CONTRIBUTING.md](CONTRIBUTING.md#testing-and-definition-of-done).

Principles (apply to every choice below):

- **KISS**: one code path, fewest moving parts, fewest dependencies.
- **As secure as possible while simple**: no keys on the device, least privilege everywhere, sensitive rules enforced in two places.
- **The charm is a body, the agent is the mind**: the charm senses and expresses; the agent decides.
- **charmd is thin**: it only does what the agent can't do safely or technically.
- **We sell nothing and ship nothing.** No warranty (README, "No warranty"). No waitlist, no kits: people build their own from the open files.

## 3. Product

### 3.1 What it is

A body for the agent you already run: eyes, a voice, a key you can find without looking. Your agent keeps its memory, skills and model. The charm is desk-first and pocket-friendly.

The charm listens to your agent's events and shows them as faces, so you know whether it's thinking, working, stuck, done or learned something new without opening a screen.

### 3.2 Why an object and not an app

A phone app could do most of this. The rest is why it's an object:

- **In view without asking.** A phone lies face-down and locked; the charm sits by the keyboard and a glance is enough.
- **It won't pull you into your phone.** Checking on the agent shouldn't end in the inbox.
- **Attachment.** People don't bond with an app icon; they do with a small thing that looks back.
- **Yours.** Your colour, your name, your faces, your firmware.

### 3.3 Lessons from the Humane AI Pin and the Rabbit R1

|                     | Humane AI Pin                                   | Rabbit R1                                 | OpenCharm                                                                   |
| ------------------- | ----------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| Price               | $699 + $24/month (2024)                         | $199 (2024)                               | About $32 of hardware, no subscription                                      |
| Speed               | Seconds per answer, often longer                | Slow cloud round-trips                    | Aims for a face reaction under 100 ms (target); it says when a task is slow |
| The basics          | Couldn't reliably set a timer or alarm          | Few everyday tasks that worked            | Everyday jobs, done by the agent you already run and its tools              |
| Learning curve      | Gestures, laser projector, palm aiming          | Scroll wheel, menus, "large action model" | One key, three moves                                                        |
| The promise         | Replace your phone                              | Replace your apps                         | Replace nothing: a body for your existing agent                             |
| If the company dies | Bricked in February 2025 after HP bought Humane | Depends on their cloud                    | Nothing happens: agent and charmd run on your machine, code is open         |

What worked instead (Ray-Ban Meta glasses): fit an existing habit, do a few things reliably, ask the user to learn nothing.

### 3.4 What it does

Day one (must never fail):

1. **Talk to your agent.** Hold the key, ask, hear one clear answer.
2. **It needs you.** Your agent's approvals and questions, answered by holding or pressing the key.
3. **Morning brief**: the one thing that matters today.
4. **Remember this**: your agent saves it; you can read the list.

Plus **presence**: the face shows what the agent is doing (section 5.4).

Everything the charm does comes from the agent: the charm has no jobs of its own. Timers, alarms and reminders are the agent's, through its tools; the charm only shows and says them (maintainer, 2 October 2026).

Skills (text files the agent learns; examples, not promises): cook hands-free, travel days, home control via Home Assistant MCP, learn something, wind down.

### 3.5 Speed budget (targets, not measurements)

| Moment                             | Target                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Face reacts to key, touch, pick-up | < 100 ms, on the device                                                                                                                       |
| Spoken reply starts                | ~1.5 s after the key is released; measured 1.8–2.8 s with Claude Code, the voice's share about 0.6 s (charmd logs each stage; 4 October 2026) |
| Still working                      | at 3 s it shows it's on it                                                                                                                    |
| Long task                          | after 20 s it says it will tell you when done (with notifications, later)                                                                     |

## 4. Interaction design

### 4.1 One key, three moves

| Move              | Meaning                                                |
| ----------------- | ------------------------------------------------------ |
| **Hold the key**  | Talk (push-to-talk). While the orange ring is on: yes. |
| **Press the key** | Everything else: wake, stop talking, dismiss, no.      |
| **Tap the face**  | It reacts. That's all.                                 |

No swipes needed. Rule: if someone can't use it ten seconds after picking it up, we've failed. The mic is on only while the key is down, and nothing leaves the charm unless it's a hold (200 ms; shorter is a press, and what the mic heard is dropped); the audio from key-down is kept so the first word isn't cut. Physical reactions (IMU): pick up → greeting, face-down → asleep and muted (the agent keeps running), shake → dizzy.

### 4.2 Three screen layouts

| Layout       | When                   | What it looks like                                                            |
| ------------ | ---------------------- | ----------------------------------------------------------------------------- |
| **Face**     | Most of the time       | Eyes and optional mouth, centred. Blinks, glances.                            |
| **Speech**   | Answers, confirmations | Eyes shrink and move up; one line types out underneath while the mouth flaps. |
| **Decision** | Approvals, questions   | Speech layout + orange ring + a hint line, e.g. `HOLD · SEND    PRESS · NO`.  |

Rules: one thing per screen; glyphs on true black; orange only when it needs you. No menus on the charm: settings live on the computer.

## 5. The face

### 5.1 Glyph faces

Every face is **two characters for eyes and an optional one for a mouth**, like 90s emoticons, drawn in Geist Mono 800 in the charm's identity colour on true black. It's cheap for an ESP32 to draw (a font, no sprite sheets), readable from across a room, and shareable as text. The browser reference implementation is `packages/design/src/charm-face.js` (the source of truth); the firmware must reproduce its behaviour.

Motion does the rest: blinks (120 ms, every 2.4–5.8 s), glances (every 1.1–3.3 s), a pop when the face changes (320 ms), a mouth that flaps while text types (38 ms per character), a blinking cursor mouth while thinking. Timings are in `packages/design/tokens.json`.

**It feels alive (spec 005)**, in the firmware and in `charm-face.js` alike:

- Motion: it breathes (the face drifts up and down about 1 % of the screen every 4.2 s; deeper, every 6.4 s, when asleep); about one blink in five is a double, one in ten is slow (320 ms); while thinking the eyes wander up, pondering; the key going down squashes the face, which bounces back in about half a second; while you talk the listening eyes swell with your voice level; while a finger is on the screen the eyes look at it.
- Behaviour: a poke gets a different reaction each time ("Hehe.", a wink, "Hey!", "Boop.", hearts), and three quick pokes make it dizzy ("Whoa…"); after four minutes with nothing happening it falls asleep (sleepy face, floating z's), and a key press or a tap wakes it with a start, then a happy face; after speaking it looks pleased for a moment; unlocking greets you with "Hi!".
- Reactions never cover a question, speech or the PIN pad. Any real agent state from charmd shows at once; only the plain idle face waits for a reaction to finish.

### 5.2 The 22 moods

| id       | Face                  | id        | Face                | id      | Face                   |
| -------- | --------------------- | --------- | ------------------- | ------- | ---------------------- |
| neutral  | `o   o`               | listening | `O   O`             | strain  | `>   <`                |
| happy    | `^   ^`               | thinking  | `o _ o` (cursor)    | sad     | `T   T`                |
| joy      | `^ v ^`               | focused   | `−   −` (tilted in) | oops    | `x   x`                |
| cute     | `^ w ^`               | curious   | `o   •`             | dizzy   | `@   @` (spinning)     |
| wink     | `^   −`               | confused  | `o   O`             | sleepy  | `−   −` (+ floating z) |
| loved    | `♥   ♥`               | surprised | `O o O`             | learned | `* v *`                |
| doubtful | `¬   ¬`               | unamused  | `− _ −`             | money   | `$   $`                |
| ask      | `o ? o` (orange ring) |           |                     |         |                        |

Full definitions (offsets, rotations, effects): `packages/design/faces.json`.

### 5.3 Colour identity

You pick the charm's colour when you name it; the shell and the glyphs share it. On screen, orange (`#FF5A1F`) is reserved for "it needs you". The identity (name, colour, greeting, sleep delay, calm motion) is the `charm` block of the workspace's `opencharm.json` (spec 014): charmd sends it to the charm before every unlock, and the agent may try on a colour with `set_look` until charmd restarts.

| Colour          | Shell     | Glyphs    | Key       |
| --------------- | --------- | --------- | --------- |
| White (default) | `#FFFFFF` | `#F4F3EE` | `#1E1F22` |
| Cobalt          | `#4574FF` | `#9DB6FF` | `#FFD166` |
| Lime            | `#BDEB4E` | `#D6F78A` | `#1E1F22` |
| Lilac           | `#B39BFA` | `#D2C4FF` | `#1E1F22` |
| Sun             | `#FFCD5C` | `#FFDF93` | `#1E1F22` |
| Coal            | `#2B2C30` | `#F4F3EE` | `#FF5A1F` |

### 5.4 Agent states → faces

| State     | Face      | When                       | Trigger (adapter event)                |
| --------- | --------- | -------------------------- | -------------------------------------- |
| Hello     | happy     | You pick it up             | IMU pick-up / first touch              |
| Listening | listening | Key held                   | device                                 |
| Thinking  | thinking  | Agent working on an answer | agent turn started                     |
| Working   | focused   | Tool or long task running  | tool call started                      |
| Needs you | ask       | Approval or question       | approval request / clarifying question |
| Done      | joy       | Task finished              | turn complete / cron done              |
| Stuck     | strain    | Retries piling up          | 3 tool errors in a row                 |
| Failed    | oops      | Something broke            | run failed                             |
| Learned   | learned   | New or improved skill      | Hermes: skill created/updated          |
| Noted     | wink      | Saved something about you  | memory write                           |
| Cost      | money     | Spend over your limit      | budget threshold                       |
| Asleep    | sleepy    | Face-down or quiet hours   | IMU / schedule                         |
| Idle      | neutral   | Nothing going on           | no events                              |

The mapping is data (`packages/design/faces.json` → `states`), so users can change it.

## 6. Hardware and enclosure

Detail (board facts, power estimates, alternatives, our own board later, enclosure dimensions and printing): [hardware/README.md](hardware/README.md). Buy list, battery safety and bench check: [docs/build.md](docs/build.md).

- **Three ways to get a charm, one firmware:** flash a supported board (most people), build one from common modules (makers), and later our own open board. We sell none of them.
- **Reference board:** Waveshare ESP32-S3-Touch-AMOLED-2.16, $31.99 with its 1000 mAh battery: a 480 × 480 AMOLED, two mics with a hardware echo reference, an IMU, supported upstream in xiaozhi-esp32. No speaker in the box (a small 8 Ω speaker is about $2, estimate). Easy-to-find alternative: the round Waveshare 1.75.
- **Enclosure v0.1:** the display glass outline grown by 1.75 mm with concentric corners (46.80 mm square, 22.0 mm deep), one key in a contrast colour, the strap leaving from the seam (no through-hole), a name plate on the back. Generated by `hardware/cad/gen.py`; not yet printed or fitted.

## 7. Architecture

```
 charm (OpenCharm OS)          emulator / desktop charm (the same core in WebAssembly)
   │  wss://charm.example.com/charm (ws://127.0.0.1:8787/charm locally)
   │  token + PIN session  ·  Opus audio + JSON
   ▼
 Caddy (TLS, automatic certificate; remote charms only)  ┐
   ▼  127.0.0.1:8787                                     │
 charmd, the charm daemon (TypeScript, own system user)  │  the agent's machine
   ▼  ACP over stdio (Claude Code, Codex, Gemini CLI,    │  (your computer, or e.g. a
   ▼  goose, Hermes, OpenClaw), or an HTTP API           │   DigitalOcean droplet)
 ONE AGENT (e.g. Hermes on http://127.0.0.1:8642/v1)     ┘
```

The device always dials out to one address. There is no separate LAN mode; a local-PC setup is the same charmd run on the PC. One install, the `opencharm` npm package: the CLI with charmd bundled in (`opencharm serve`), admin commands and `opencharm mcp`. Not used: agent-on-chip frameworks (ESP-Claw, MimiClaw), because the agent already exists elsewhere.

### 7.1 OpenCharm OS and the emulator

`firmware/core` is portable C++17 (LVGL screens, glyph face, state machine, charm protocol) that talks only to a small HAL. `firmware/device` (planned, spec 009) will be a hard fork of [xiaozhi-esp32](https://github.com/78/xiaozhi-esp32) (MIT, ESP-IDF 6.0) whose drivers implement the HAL. `firmware/sim` builds the same core to WebAssembly: `npx opencharm sim` opens the charm in any browser on localhost (Space is the key, the mouse taps and types the PIN, a side panel drops Wi-Fi, switches square/round and forgets the pairing). The core enforces the mic rule and draws only when something moved. Detail: [firmware/README.md](firmware/README.md).

### 7.2 charmd, the charm daemon

The program between the charm and the agent (the _d_ is the Unix habit for background services, like `sshd`). It owns only what the agent can't do: the door (XiaoZhi WebSocket protocol, Opus audio), the guard (pairing, tokens, PIN, lock, revoke, permissions) and voice plumbing (listening and speaking, chosen separately; by default Parakeet listens on the computer and Microsoft's free voices speak, falling back to a local voice; others: whisper, macOS voices, OpenAI with the user's key; spec 003). Behaviour (memory, persona, speaking style, what to show) belongs to the agent.

- **Agents:** charmd starts a local agent itself over ACP (spec 010), or calls a server agent's HTTP API (Hermes, OpenClaw, anything OpenAI-compatible), with a stable session per charm. A local agent works in a workspace cloned from opencharm-starter (`opencharm init`), with its permissions pinned by tests.
- **The agent drives the charm** through an MCP server, `opencharm mcp`, with the tools `say`, `show_face`, `ask`, `notify` (spec 012) and `set_look` (spec 014). A permission request from the agent becomes a question on the charm; answers are always "once" (spec 011).
- **At rest** it does no work between turns (one shared WebSocket ping every 30 s). Detail, config and measured latency: [packages/charmd/README.md](packages/charmd/README.md).

### 7.3 The desktop charm

OpenCharm without the hardware (spec 013): `apps/desktop`, a Tauri 2 app around the same firmware core. On a Mac the eyes sit on either side of the notch, and a panel opens below it for speech, questions and pairing; elsewhere it's a black pill at the top centre. A global talk key (⌥ Space by default) works in any app, and the mic is open only while it's held; with Speak replies off (menu bar) its replies show as text instead, and a typing key (⌥⇧ Space) opens a one-line field to type to it, answered as text. It carries and runs its own charmd and Node (spec 013, port 8790), so nothing else needs installing, and pairs with it by itself. Releases for macOS and Windows come from CI with checksums, without a developer signature by choice (macOS builds are signed ad hoc). Detail: [apps/desktop/README.md](apps/desktop/README.md).

## 8. Protocol (charm ↔ charmd)

We speak xiaozhi-esp32's WebSocket protocol and add one namespaced message type, `{"type": "charm", "op": ...}`, for everything that is ours. This keeps the fork's transport untouched and lets stock XiaoZhi devices talk to charmd. Schemas, a parser that never throws and shared JSON fixtures live in `packages/protocol`; the message tables are in [packages/protocol/README.md](packages/protocol/README.md).

- **Connection:** `wss://<host>/charm` with `Authorization: Bearer <token>` (none before pairing). The charm finds the address through XiaoZhi's config check endpoint, which charmd serves at `/ota/`.
- **Kept from XiaoZhi:** `hello`, `listen` (key held / released), `abort`, binary Opus (up 16 kHz mono 60 ms frames, down 24 kHz), `stt`, `tts` (start, sentence, stop) and `llm` `emotion` for stock devices. Ours include `charm text`, typed text from the desktop charm, offered to the desktop charm in charmd's hello (`features.text`).
- **What the charm runs:** its `hello` may carry `build: { kind, version, commit }` (`emulator`, `desktop` or `board`; spec 015). It's optional, so stock XiaoZhi firmware still connects, and never a reason to refuse a charm; `opencharm status` shows it.
- **Ours:** pairing (`pair_code`, `paired`), the lock (`unlock`, `unlocked`, `locked`, `revoked`), `face` (an agent state id from section 5.4, with an optional short line) questions (`ask`, `ask_end`, `answer`) and the charm's identity (`look`, sent right before every `unlocked`). Later: `notify`, `signal`, `permissions`.
- "Speaking" is not a face: the charm shows its speech layout between `tts start` and `tts stop`. Until `unlocked`, charmd ignores `listen` and audio and answers `locked`.

## 9. Security and permissions

**Pairing and lock**

- Pairing: an unpaired charm connects, charmd sends a 6-digit code (valid 300 s), the charm shows it, the admin runs `opencharm pair <code>` on the agent's machine and sets a PIN (4–12 digits), charmd sends a 32-byte random token.
- Lock on every power-on and every new connection; `opencharm lock <charm>` from the agent's machine (effective within 2 s); 5 wrong PINs → blocked until `opencharm unlock <charm>`; `opencharm revoke <charm>` cuts it off.
- charmd stores only hashes: SHA-256 of tokens, scrypt (salted) of PINs. The PIN is never stored on the charm.
- Post-MVP: optional auto-lock after hours without motion.

**Threats and protections**

| Threat                              | Protection                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Network attacker                    | charmd speaks plain `ws://` and refuses a non-loopback bind unless `allowInsecureRemote` is set; a remote charm goes through TLS in front of it (e.g. Caddy), and the charm verifies the certificate (ESP-IDF CA bundle)                                                                                     |
| Stolen charm                        | Token useless without the PIN; lock on boot; 5 tries; revoke                                                                                                                                                                                                                                                 |
| Flash dump                          | Only a revocable token; never the PIN                                                                                                                                                                                                                                                                        |
| Pairing-code guessing               | A code only binds when the admin types it on the agent's machine; 300 s expiry; cap on pending pairings                                                                                                                                                                                                      |
| Misbehaving agent with shell access | charmd runs as its own system user; `/var/lib/charmd/state.json` is 0600; `/etc/opencharm` (config and the keys in `charmd.env`) is `root:charmd 0640`; admin commands only via `sudo -u charmd opencharm ...`; every charm tool passes the permission check                                                 |
| Compromised charmd                  | Cannot open the mic: the firmware only listens while the key is held                                                                                                                                                                                                                                         |
| Floods and junk                     | Size limits on JSON and audio frames, connection cap, unpaired connections closed after 120 s                                                                                                                                                                                                                |
| Supply chain                        | Five runtime dependencies in the CLI (`ws`, `zod`, `@agentclientprotocol/sdk`, `opusscript`, `sherpa-onnx-node` with its native build per platform); voice models downloaded on first use, pinned by SHA-256; lockfile, `npm audit` in CI, published with npm provenance (`cli-release.yml`); pinned ESP-IDF |
| Privacy                             | No audio stored; transcripts not logged by default; listening stays on the computer by default, but the default voice sends the text of each spoken reply to Microsoft (`init` and the docs say so; `"speak": { "provider": "local" }` keeps it all local)                                                   |

**Tokens never travel in URLs** (spec 007's security review): behind a reverse proxy every connection reaches charmd from loopback, so a URL token accepted "from loopback only" would really be accepted from the internet. The charm sends `Authorization: Bearer`; the emulator offers the WebSocket subprotocols `opencharm` and `opencharm.token.<token>`, and charmd answers `opencharm`.

**On a server** (spec 007, built; waiting for a droplet to verify): `sudo opencharm setup --domain <d>` creates the `charmd` system user, its folders and a hardened systemd unit, and prints the Caddy block (`charm.example.com { reverse_proxy 127.0.0.1:8787 }`). The firewall allows only SSH (keys only) and the web ports; Hermes' API server binds to 127.0.0.1. Guide: [docs/deploy.md](docs/deploy.md).

**Permissions (model; the MVP ships fixed safe defaults)**: each capability is Allow / Ask / Deny, with "Ask" shown on the charm as a decision ("Hermes wants to talk first. HOLD · ALLOW PRESS · NO"). Denied capabilities are not offered to the agent at all. Mic and speaker permissions are also enforced on the charm, and widening them needs a hold on the charm. MVP defaults: never speaks first, no wake word, no sensor sharing. Proposed defaults: speak first Ask; listen by wake word Deny; follow-up listening Allow; "I have something" notices Allow; share motion Allow; share place (home/away) Ask; share battery and time Allow; approve actions from the charm low-risk only; quiet hours 23:00–08:00.

## 10. Roadmap

| Milestone                    | Outcome                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **M0 Emulator + charmd**     | Audio spike; charmd MVP; `firmware/core` running in the emulator against charmd with Hermes on the droplet (specs 001–006 done; 007, the droplet, in progress)                             |
| **M0.5 Bench**               | Reference board arrives; factory and XiaoZhi firmware tested; inside measured; the bench checks in `hardware/README.md` answered                                                           |
| **M1 Firmware**              | `firmware/device` (XiaoZhi fork) implements the HAL; the same core runs on the 2.16 with echo cancellation on; MVP definition of done met on the device                                    |
| **M2 Agent tools**           | MCP charm tools and needs-you approvals done (specs 011, 012); next: permissions engine, Hermes charm skill, notifications                                                                 |
| **M3 OpenClaw**              | Verified with the OpenClaw preset and charm skill; optional esp-openclaw-node                                                                                                              |
| **M4 Enclosure**             | Printed back for the Waveshare case, then shell v0.2 from real measurements                                                                                                                |
| **M5 Flash-and-print guide** | Browser flasher, docs, face packs; "buy this board, flash in your browser, print your back"                                                                                                |
| DIY charm                    | Compact parts (for example Seeed XIAO ESP32S3, INMP441, MAX98357A, small screen, flat LiPo), chosen once the firmware runs on the bench; a "DIY" variant in `gen.py`; a step-by-step guide |
| Later                        | Our own open board with motor and Qwiic                                                                                                                                                    |

Not in the MVP (next, in order): permissions engine; the Hermes/OpenClaw charm skill; "I have something" and handoff; IMU signals and pocket/desk modes with the 4.1 V charge limit; auto-lock by inactivity; local-PC mode docs; browser flasher; the 1.75 board; printed shell fitting; the DIY guide. Build order and status of each spec: [specs/README.md](specs/README.md).

## 11. Landscape: other bodies for agents

The rows from Anthropic's buddy down were checked on 1 October 2026 (sources in `specs/013-desktop-charm/spec.md`).

| Project                                                        | What                                                                               | Notes                                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| ClawStage (HooRii)                                             | Raspberry Pi 5 desk shell for one OpenClaw identity; 720×720 screen, servo, camera | Waitlist/Kickstarter, desk-only, vendor platform                                              |
| Rorolee                                                        | Wearable one-click Hermes/OpenClaw agent                                           | Kickstarter (May 2026); agent runs in their cloud                                             |
| Hermes Familiar                                                | ESP32-S3 desk display as a Hermes gateway plugin                                   | Small hobby project; the plugin pattern we'll follow                                          |
| hermes-embodiment                                              | Hermes events → 16-expression SVG face on a Pi 5 with a 4.3″ screen                | On the GitHub account of Teknium (Nous Research co-founder); desk screen, not a pocket device |
| ClawBody                                                       | OpenClaw in a Reachy Mini robot                                                    | Needs a Pollen Robotics robot                                                                 |
| xiaozhi-openclaw-voice-terminal                                | XiaoZhi on a Waveshare S3 board with an OpenClaw face                              | Direct prior art for charmd                                                                   |
| pizero-openclaw                                                | Pi Zero 2 W + Whisplay handheld as an OpenClaw client                              | Linux route                                                                                   |
| Seeed SenseCAP Watcher                                         | "Physical AI agent" with camera                                                    | Community OpenClaw port                                                                       |
| Espressif esp-openclaw-node                                    | ESP32 as an OpenClaw Node                                                          | Building block                                                                                |
| Anthropic claude-desktop-buddy (and forks; Vibe Desktop Buddy) | ESP32 desk pet over BLE; approve or deny with buttons                              | Official, MIT; Claude desktop app only; no voice                                              |
| Clawdmeter                                                     | Claude usage dashboard on our exact board (Waveshare 2.16)                         | Keys send Space for Claude Code's /voice                                                      |
| cardputer-voice-assistant                                      | M5 Cardputer, hold to talk to the Claude Agent SDK on a Mac with your subscription | Claude only; confirmation by voice                                                            |
| Clawlexa                                                       | Waveshare ESP32-S3, wake word, local Whisper and Piper, MCP                        | Wake word (we never listen without the key)                                                   |
| xiaozhi-windows-agent                                          | XiaoZhi device sends tasks to Claude Code and Codex on a PC                        | Needs the xiaozhi.me cloud; no approval                                                       |
| Stream Deck plugins, claude-remote-approver                    | Allow and deny keys, or approvals on a phone                                       | Approval only, no voice                                                                       |
| ACP voice clients (qwen-audio-agent, VACP)                     | Voice clients for any ACP agent                                                    | Desktop and Android, no device                                                                |
| Notch apps (Claude Peek, NotchAgent, seam, Clawd on Desk…)     | Agent status, some with approvals, in the Mac notch or on the desktop              | Status apps, not a voice body                                                                 |
| Meta Muse Charm                                                | Keychain screen with an avatar, press to talk, 5G                                  | Meta's own agent and cloud                                                                    |
| Claude Code /voice                                             | Built-in hold-to-talk in the terminal (March 2026)                                 | Cloud speech-to-text, no device                                                               |

Each piece exists somewhere. What we found nowhere else is the combination: agent-agnostic over ACP; one key both to talk and to approve; MCP tools for the agent to drive its body; fully local with no vendor cloud; the same firmware core in a browser emulator; memory and persona as plain files; a printable case, and nothing sold.

Safe to say: "an open-source body for the agent you already run", "one key to talk and to approve", "runs on your computer, no cloud of ours", "try it in your browser: the emulator runs the real firmware". Don't say "the first" anything: Anthropic's buddy already approves on a device, and several projects already talk to Claude Code by voice.

Our gap: about $32, fully open, works with the agent you already host (not a vendor cloud), Hermes and OpenClaw through their own extension points, pocket-sized, one key, and a face people get attached to. The face and the setup experience are the moat.

## 12. Open questions

- Speaker plug type, stack depth, which side button is GPIO18 (bench check on arrival, spec 009).
- Whether on-device echo cancellation runs for the 2.16 in upstream XiaoZhi (spec 009).
- Upstream xiaozhi-esp32 issue #2099 (`BOARD_TYPE` missing in menuconfig) and the ESP-IDF 6.0 build (spec 009).
- OpenAI voice latency: not measured yet (no key used so far; spec 007's smoke test).
- Exact Hermes plugin and OpenClaw gateway event names for each state in 5.4 (post-MVP agent tools).
- Name plate and pairing flow details; how a charm is named and coloured at setup.
- A trademark check for "OpenCharm" (see section 13.1). Licences are chosen (README).

## 13. Brand, pages and identity

- Look: white and black, like a technical drawing on paper: off-white ground (`#F6F6F4`) with a faint grid, black ink, mono labels, dimension lines; flat, no glow. The charm and its chosen colour are the only colour on the page. Tokens in `packages/design/tokens.json`.
- Type: Geist and Geist Mono (Google Fonts).
- Copy: plain, short sentences; mark estimates and unverified claims as such.
- `hardware/prototype/PROTOTYPE.html` is the engineering prototype page; it loads `packages/design/src/charm-face.js`. `PROTOTYPE.html` is generated from `hardware/prototype/prototype-template.html` (`npm run prototype:build`).
- The site (`apps/web`, spec 008) is Next.js on **Vercel**, fully static: no forms, no database, no accounts, no cookies. Page views are counted with Vercel Web Analytics, without cookies (spec 008). It explains the charm and ends with "Build yours" (the build guide and the code). No waitlist and no shipping, by decision (30 September 2026): it keeps the project simple and avoids storing anyone's data.
- Text-character faces are a decades-old idea and free to use; we avoid copying any specific character set (for example OpenAI's DevDay 2026 bots) by using our own shape, palette and type.
- App icon (`brand/icon/`): the device seen from the front. The file is a plain square filled with the shell colour: no border, no baked-in rounding (iOS, macOS and Android apply their own mask). The black screen is a squircle, deliberately rounder than the platform mask (corner about 31% of its width versus 22%), so the head looks soft and friendly. The face is `^ ^` in Geist Mono 800 (outline embedded, Geist is SIL OFL 1.1). Primary: white shell, off-white face on a black screen, matching the default white charm; users print the shell in any colour. The black screen with the face is the recognisable part: on light backgrounds the white rim fades and the icon reads as a black squircle with `^ ^`, which is accepted. Other colours are in `brand/icon/variants/`; change `PRIMARY` in `brand/build_icon.py` to switch. Use `icon-maskable` for Android/PWA.

### 13.1 Project identity

|                |                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Name           | **OpenCharm** (one word, capital O and C)                                                                                                      |
| Domain         | **opencharm.dev** (registered on Namecheap). opencharm.com, .app and .org are taken by others; opencharm.io was unregistered when last checked |
| GitHub         | organisation **opencharm-labs**, main repo **opencharm**                                                                                       |
| npm            | package **opencharm** (unscoped), organisation **@opencharm-labs**                                                                             |
| Social handles | `opencharm` where available, otherwise `opencharmlabs`                                                                                         |
| One-liner      | "The open-source charm for your AI agent."                                                                                                     |
| Site headline  | "Meet your agentic companion." Subtext: "A tiny charm that gives the agent you already run a face, a voice and one key."                       |

Positioning: an open, build-it-yourself alternative in the space Meta opened with Muse Charm (September 2026). Use the word "charm" freely; never use "Muse" in our name, handles, topics or visuals. Comparisons such as "an open-source alternative to Meta's Muse Charm" go in one comparison section only. Get a trademark check before launch, and keep a fallback name ready.

## 14. Sources

- Hardware: [Waveshare ESP32-S3-Touch-AMOLED-2.16](https://www.waveshare.com/esp32-s3-touch-amoled-2.16.htm); every board source is listed in [hardware/README.md](hardware/README.md#sources).
- Agents: [Hermes Agent docs](https://hermes-agent.nousresearch.com/docs/), [features](https://hermes-agent.nousresearch.com/docs/user-guide/features/overview), [GitHub](https://github.com/nousresearch/hermes-agent); [OpenClaw docs](https://docs.openclaw.ai/), [features](https://docs.openclaw.ai/concepts/features), [GitHub](https://github.com/openclaw/openclaw).
- XiaoZhi: [xiaozhi-esp32](https://github.com/78/xiaozhi-esp32) ([board support issue #1947](https://github.com/78/xiaozhi-esp32/issues/1947)), [xiaozhi-esp32-server](https://github.com/xinnan-tech/xiaozhi-esp32-server), [xiaozhi-openclaw-voice-terminal](https://github.com/erforschtbot-cmyk/xiaozhi-openclaw-voice-terminal).
- On-chip agents: [esp-openclaw-node](https://github.com/openclaw/esp-openclaw-node) ([registry](https://components.espressif.com/components/espressif/esp-openclaw-node)), [ESP-Claw](https://github.com/espressif/esp-claw), [MimiClaw](https://github.com/memovai/mimiclaw).
- Bodies: [Hermes Familiar](https://github.com/webdevtodayjason/hermes), [hermes-embodiment](https://github.com/teknium1/hermes-embodiment), [pizero-openclaw](https://github.com/sebastianvkl/pizero-openclaw), [ClawStage](https://github.com/HooRii-OT/clawstage), [Rorolee (Gadgetify)](https://www.gadgetify.com/rorolee-wearable-hermes-openclaw/), [ClawBody](https://github.com/tomrikert/clawbody), [awesome-openclaw-hardware-projects](https://github.com/Seeed-Projects/awesome-openclaw-hardware-projects).
- Meta's charm: [Muse Charm (Meta)](https://www.meta.com/muse-charm/), [CNBC launch coverage](https://www.cnbc.com/2026/09/23/mark-zuckerberg-1299-meta-vr-glasses-ai-agent.html).
- AI Pin and R1: reviews in The Verge, Engadget, Wired and The Washington Post (April–May 2024); HP's acquisition of Humane and the Pin shutdown (February 2025); Rabbit active-user figures reported in September 2024; [Rabbit r1 on Wikipedia](https://en.wikipedia.org/wiki/Rabbit_r1), [Humane Ai Pin on Wikipedia](https://en.wikipedia.org/wiki/Humane_AI_Pin).
