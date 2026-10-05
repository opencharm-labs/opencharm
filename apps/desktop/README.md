# The desktop charm

OpenCharm without the hardware: your charm lives by the Mac's notch. Its eyes sit on either side of the notch, breathing and blinking. Hold the talk key in any app to speak. When it answers, thinks or needs you, a panel opens below the notch. On a Mac without a notch, and on Windows, it's a black pill at the top centre of the screen.

It's the same OpenCharm OS as the board and the emulator: the firmware core compiled to WebAssembly, in a small Tauri 2 app. Overview: [OPENCHARM.md](../../OPENCHARM.md) ("The desktop charm"); specs `specs/013-desktop-charm` and `specs/013-desktop-charm`. The pitch is "the charm, without the hardware", not a notch status app.

**No warranty:** provided as is; see the [disclaimer](../../README.md#no-warranty).

## Install

Download the latest **OpenCharm Desktop** from [Releases](https://github.com/opencharm-labs/opencharm/releases):

- macOS (Apple silicon or Intel): the `.dmg` (`aarch64` for Apple silicon, `x64` for Intel). Drag OpenCharm into Applications and open it. The builds are signed ad hoc, not by an Apple developer, so the first time macOS says it can't verify the developer: choose **Done**, then **System Settings → Privacy & Security → Open Anyway** (on macOS 14 and older, right-click OpenCharm and choose **Open**). If macOS says OpenCharm "is damaged" (desktop 0.2.0 and older, whose bundle wasn't signed), check the checksum (below), then run `xattr -dr com.apple.quarantine /Applications/OpenCharm.app`.
- Windows: the setup `.exe`. SmartScreen warns about unsigned apps: **More info → Run anyway**.

**Why unsigned, and how to check what you downloaded:** this is an open-source project without a paid signing identity, so macOS and Windows can't vouch for it. You can check it yourself:

- **Checksums:** every release has a `SHA256SUMS.txt`. Compare it with `shasum -a 256 OpenCharm_*.dmg` (macOS) or `Get-FileHash OpenCharm_*.exe` (Windows).
- **Provenance:** GitHub attests that each file was built by this repository's release workflow from a given commit. Check it with `gh attestation verify <file> --repo opencharm-labs/opencharm`.
- **Build it yourself** (below).

**Updates:** once a day the app asks GitHub for the public list of `desktop@` release tags whether there's a newer version (nothing about you is sent). If there is, the menu-bar menu and Settings offer it, and you download it the same way. Turn this off in Settings. After an update, macOS may ask again for the microphone, because an unsigned app's identity changes with each build.

Nothing else to install: the app carries its own charmd and Node (spec 013). Your agent is yours to install (Claude Code, Codex…); creating a workspace from Settings also needs `git`.

## First run

Open OpenCharm and the setup walks you through it, one step at a time (spec 013):

1. **Welcome:** where the charm lives and the talk key (⌥ Space on a Mac, Ctrl Alt Space on Windows).
2. **Your agent:** Claude Code, Codex, Gemini CLI, goose, Hermes or OpenClaw, marked Found when its command is on your PATH (on Windows also with `.cmd`/`.exe` and npm's global folder), with a link to install a missing one; or another agent, by its ACP command or an OpenAI-compatible server.
3. **Its folder:** create a new workspace from a name and a location (your Documents folder to start, the last one remembered), or use a folder you have: a workspace is used as its `opencharm.json` says, any other folder is where your agent works.
4. **Your charm:** its name and colour (the six, or your own).
5. **Its voice:** how it speaks and the language to fall back on, and the microphone, asked now rather than mid-sentence.
6. **Say hi:** hold the key and talk; it ticks off "awake", "heard you" and "answered", or says what's wrong.

Each step is saved when you continue, so if you quit halfway it opens at the step you left. It opens again if your folder disappears, and **Set up again…** in the menu-bar menu reopens it. Settings is for changing things afterwards.

There's no code or PIN to type: the app pairs with its own charmd through charmd's owner-only admin socket. It keeps a random 12-digit PIN in a file only you can read, in the app's data folder (`pin`, owner-only), and types it when the charm starts locked. Not the keychain: an unsigned app's identity changes with each build, so macOS asked for the keychain item at every start, and anything running as you can already use charmd's owner-only admin socket. An install from before this pairs again by itself, once; its old keychain item stays there unused (Keychain Access can delete `dev.opencharm.desktop`, account `pin`). The keychain is read only for an OpenAI key, if you choose OpenAI.

The app's charmd listens on port 8790, with its own config, state and log, so a charmd you run in a terminal (8787) is never touched. It restarts if it stops and quits with the app.

**Another charmd** (Settings → Advanced): connect to a charmd you run yourself. Run `opencharm serve`, open OpenCharm, then `opencharm pair <code>` with the code under the notch and choose a PIN. Click the panel, type the PIN and press Enter.

**Settings:** from the menu-bar icon (the charm's head as a template image) or a right-click on the charm. Its footer shows what the app is, `desktop@<version> (<commit>)` (spec 015), for bug reports; the app's charm sends the same in its hello.

## How it behaves

- **The window** floats above the menu bar on every Space and comes to the front when it opens. It measures the real notch, or draws a black pill without one; on Windows the pill sits at the top centre, the same layout as the Mac's.
- **Its own charmd** (spec 013): the app carries the `opencharm` CLI built from its own commit and Node 24 (pinned in `node.json`, checked against its SHA-256 when it's staged), as resources, and runs charmd with them. That Node is first on the PATH charmd and your agent get, so `npx` (Claude Code's and Codex's adapters) is the app's own; an agent's adapter is still downloaded the first time it starts. Settings → Advanced can point at another `opencharm` instead; a development build (`npm run desktop`) uses the installed one, unless `OPENCHARM_BUNDLED=1` (after `npm run stage -w apps/desktop`). It keeps its state and admin socket in the app's data folder. `charmd/THIRD_PARTY_NOTICES.md` in the app lists Node and every bundled npm package with its licence; Node's and the CLI's licence files are next to them.
- **Settings:** under your agent: a folder, the agent (an ACP preset, a custom ACP command, or an OpenAI-compatible server), **Listening** (on this computer, OpenAI with the key in the keychain, or none), **Speaking** (Microsoft's free voices, the default: the text of each spoken reply goes to Microsoft, through an unofficial service; on this computer, private; a macOS voice; OpenAI; or none) and the **language** to fall back on (it answers in the language you speak), a status line and Restart. **Speak replies** (also in the menu bar): off, replies show as text by the notch, for a quiet office; it changes from the next reply, without restarting charmd. The **typing key** (⌥⇧ Space; Ctrl Alt Shift Space on Windows; also **Type to your charm…** in the menu bar) opens a one-line field in the panel: Enter sends it and the reply comes as text, Esc or clicking away closes it, and the app you were in gets the keyboard back. One line, one reply: longer work belongs in your agent's own chat. With another `opencharm` (Settings → Advanced) that's older than the app, the field says to update it. With the default voice, the first start downloads the voice models (about 620 MB). Another `opencharm` older than the app gets the voice it understands, and the status line says to update it (`npm install -g opencharm`). Then **Your charm** (spec 014):
  - its name, its colour (the six identity colours or your own, picked or typed as `#RRGGBB`; the charm in Settings and by the notch follows it) and its greeting
  - its macOS voice, when Speaking is "A macOS voice": those of your system language first, with **Try it**
  - when it falls asleep (2, 4, 10 or 30 minutes alone, or never), calm motion, and whether the agent may change its look (`set_look`)

  In a workspace these are saved in its `opencharm.json` (the `charm` block and the macOS voice in `voice.speak.voice`, or `voice.sayVoice` in an older workspace; every other key kept); for any other folder, in the app's settings. A change to the look reaches the charm at once through charmd's admin socket, without a restart; a new voice, or the agent's permission, restarts the app's charmd.

  Then the talk key and start at login. Advanced: another charmd's address, the CLI's path, forget the pairing.

- **Pairing with its own charmd** types the PIN only on a boot lock, never after `opencharm lock`.
- **Long runs:** displays are re-measured every 4 s, and the charm moves when the notch or screen changes. The charm reconnects when the network comes back. On Windows, charmd and its agent run in a job object, so they end with the app even after a crash.
- **Releases are unsigned by choice** (maintainer, 1 October 2026); see Install for how to check them.

## Build it yourself

You need Node 24, Rust (`rustup`), and the emulator built once (`npm run firmware:sim`, needs Emscripten; see `firmware/README.md`). To carry charmd as a release does: `npm run build -w packages/cli`, then `npm run stage -w apps/desktop` (downloads the pinned Node into `apps/desktop/charmd/`).

```bash
npm run desktop          # run it (development)
npm run desktop:build    # bundle the app and installer into apps/desktop/src-tauri/target/release/bundle
npm run test:rust -w apps/desktop
```

## Releases

The app releases itself from `main` (CONTRIBUTING, "Releasing"): when a merged pull request's title is a `fix`, `feat` or `perf` and it touches `apps/desktop`, `firmware/core`, `firmware/sim`, `brand/icon`, `packages/design` (the face engine its pages include), or the charmd it carries (`packages/cli`, `packages/charmd`, `packages/protocol`, `package-lock.json`), `.github/workflows/desktop-release.yml` builds the emulator once, then for macOS (Apple silicon and Intel) and Windows builds the CLI, stages it with the pinned Node for that target, and runs `tauri build`, and a final job attaches the installers, `SHA256SUMS.txt` and build-provenance attestations to a draft and publishes it as `desktop@<version>`. The version comes from the tag (the code says `0.0.0`); a build from source offers no updates. The update check looks for `desktop@` releases in `opencharm-labs/opencharm`.

## Resource use

The charm is always on, so it has to be nearly free at rest. Measured on an M-series MacBook (1 October 2026), at rest with its own charmd:

- about 2% of one core in total (web view, GPU process and the app)
- charmd at 0%
- about 75 MB for charmd and about 80 MB for the app and its web view
- a 4 MB app binary (a size-first, link-time-optimised release build); the whole app with its charmd is 187 MB installed on Apple silicon (`desktop@0.7.0`; Intel and Windows not measured). Downloads for `desktop@0.7.0` (5 October 2026): 57 MB (`aarch64.dmg`), 60 MB (`x64.dmg`), 34 MB (`x64-setup.exe`).

How:

- The face only redraws what moved, and the loop slows to 10 Hz at rest.
- The speaker's audio is suspended between replies.
- charmd's supervisor sleeps until charmd exits.
- The display check runs every 4 s.

To measure it yourself: Activity Monitor, or `top -pid <pid>` for `opencharm-desktop` and the `com.apple.WebKit` processes.

## For automated tests

These are environment variables for tests, never for normal use:

- `OPENCHARM_FAKE_MIC=1`: a soft tone instead of the microphone, so no real mic is ever opened.
- `OPENCHARM_TEST_PIN=<pin>`: with the fake mic, types the PIN when asked, holds the key for one turn, and logs what the charm receives.
- `OPENCHARM_TEST_PIN=auto`: the same, with the app's own charmd pairing and unlocking by itself.
- `OPENCHARM_DATA=<folder>`: settings and the app's own charmd in this folder, its own PIN file, and a separate keychain entry for an OpenAI key (`dev.opencharm.desktop.test`), so a test never touches your own.
- `OPENCHARM_URL`: another charmd.
- `OPENCHARM_KEY`: another talk key.

`node scripts/preview.mjs <ws url> <out dir>` renders the page in headless Chrome for design reviews.
