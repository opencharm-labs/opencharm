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

**Updates:** once a day the app asks GitHub for the public list of `desktop@` release tags whether there's a newer version (nothing about you is sent). If there is, the menu-bar menu and Settings offer it, and you download it the same way. Turn this off in Settings. After an update, macOS may ask again for the microphone and the keychain, because an unsigned app's identity changes with each build.

It needs Node 24 and the OpenCharm CLI (`npm install -g opencharm`): the app runs charmd with it, next to your agent.

## First run

1. Open OpenCharm. Settings opens: under **Your agent**, choose a folder.
   - An OpenCharm workspace (for example one made with `opencharm init`) is used as it's configured.
   - An empty folder: **Create a workspace here**.
   - Any other folder (a repo): your agent works in it as it is.
2. Choose the agent (Claude Code by default, Codex, Gemini CLI, goose, Hermes, OpenClaw, another ACP command, or an OpenAI-compatible server) and the voice. The status line says when charmd is running.
3. Hold **⌥ Option + Space** (Windows: **Ctrl + Alt + Space**) and talk. The first time, allow the microphone. It's only on while you hold the key.

There's no code or PIN to type: the app pairs with its own charmd through charmd's owner-only admin socket. It keeps a random 12-digit PIN in your keychain and types it when the charm starts locked. Because the builds aren't signed, macOS may ask once after an update whether OpenCharm may use its keychain item: choose **Always Allow**.

The app's charmd listens on port 8790, with its own config, state and log, so a charmd you run in a terminal (8787) is never touched. It restarts if it stops and quits with the app.

**Another charmd** (Settings → Advanced): connect to a charmd you run yourself. Run `opencharm serve`, open OpenCharm, then `opencharm pair <code>` with the code under the notch and choose a PIN. Click the panel, type the PIN and press Enter.

**Settings:** from the menu-bar icon (the charm's head as a template image) or a right-click on the charm. Its footer shows what the app is, `desktop@<version> (<commit>)` (spec 015), for bug reports; the app's charm sends the same in its hello.

## How it behaves

- **The window** floats above the menu bar on every Space and comes to the front when it opens. It measures the real notch, or draws a black pill without one; on Windows the pill sits at the top centre, the same layout as the Mac's.
- **Its own charmd** (spec 013) is started with the installed `opencharm` CLI, found through the login shell or a path in Settings. It keeps its state and admin socket in the app's data folder.
- **Settings:** under your agent: a folder, the agent (an ACP preset, a custom ACP command, or an OpenAI-compatible server), the voice (local, OpenAI with the key in the keychain, or none), a status line and Restart. Then **Your charm** (spec 014):
  - its name, its colour (the six identity colours; the charm in Settings and by the notch follows it) and its greeting
  - its voice for the local voice: the Mac's voices, those of your system language first, with **Try it**
  - when it falls asleep (2, 4, 10 or 30 minutes alone, or never), calm motion, and whether the agent may change its look (`set_look`)

  In a workspace these are saved in its `opencharm.json` (the `charm` block and `voice.sayVoice`, every other key kept); for any other folder, in the app's settings. A change to the look reaches the charm at once through charmd's admin socket, without a restart; a new voice, or the agent's permission, restarts the app's charmd.

  Then the talk key and start at login. Advanced: another charmd's address, the CLI's path, forget the pairing.

- **Pairing with its own charmd** types the PIN only on a boot lock, never after `opencharm lock`.
- **Long runs:** displays are re-measured every 4 s, and the charm moves when the notch or screen changes. The charm reconnects when the network comes back. On Windows, charmd and its agent run in a job object, so they end with the app even after a crash.
- **Releases are unsigned by choice** (maintainer, 1 October 2026); see Install for how to check them.

## Build it yourself

You need Node 24, Rust (`rustup`), and the emulator built once (`npm run firmware:sim`, needs Emscripten; see `firmware/README.md`).

```bash
npm run desktop          # run it (development)
npm run desktop:build    # bundle the app and installer into apps/desktop/src-tauri/target/release/bundle
npm run test:rust -w apps/desktop
```

## Releases

The app releases itself from `main` (CONTRIBUTING, "Releasing"): when a merged pull request's title is a `fix`, `feat` or `perf` and it touches `apps/desktop`, `firmware/core`, `firmware/sim`, `brand/icon` or `packages/design` (the face engine its pages include), `.github/workflows/desktop-release.yml` builds the emulator once, then macOS (Apple silicon and Intel) and Windows with `tauri build`, and a final job attaches the installers, `SHA256SUMS.txt` and build-provenance attestations to a draft and publishes it as `desktop@<version>`. The version comes from the tag (the code says `0.0.0`); a build from source offers no updates. The update check looks for `desktop@` releases in `opencharm-labs/opencharm`.

## Resource use

The charm is always on, so it has to be nearly free at rest. Measured on an M-series MacBook (1 October 2026), at rest with its own charmd:

- about 2% of one core in total (web view, GPU process and the app)
- charmd at 0%
- about 75 MB for charmd and about 80 MB for the app and its web view
- a 4 MB app (a size-first, link-time-optimised release build)

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
- `OPENCHARM_DATA=<folder>`: settings and the app's own charmd in this folder, and a separate keychain entry (`dev.opencharm.desktop.test`), so a test never touches your own.
- `OPENCHARM_URL`: another charmd.
- `OPENCHARM_KEY`: another talk key.

`node scripts/preview.mjs <ws url> <out dir>` renders the page in headless Chrome for design reviews.
