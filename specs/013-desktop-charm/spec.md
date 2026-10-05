# 013: The desktop charm

Status: In progress
Depends on: 004, 005, 006, 010, 011

## Why

Not everyone wants to buy a board and print a shell. The same companion can live on the computer they already use: by the notch on a Mac, at the top of the screen on Windows. It works as an entry point (try it today, build the hardware later) and as a product of its own (a desk assistant that's always one key away). The app should also set up the agent itself: pick a folder, pick an agent, and talk, with no terminal and no PIN.

## Scope

- **The same firmware core,** compiled to WebAssembly as in the emulator (spec 006), so the behaviour matches the hardware: the state machine and the mic rule, questions on the charm (hold = yes, press = no), the alive face (spec 005), pairing with charmd.
- **The notch layout in the core** (`ViewOptions.notch`: `notch_width`, `strip_height`):
  - compact: the eyes sit on the ears either side of the notch, a size up from the board's; nothing is drawn inside the notch or below the strip
  - open: a panel below the notch with the mouth just below the notch, the speech captions, the question and its hint, or a status line; the orange needs-you outline only on the panel
  - `on_panel` tells the platform when the panel opens and closes, and how tall it is: questions, pairing and the PIN take the whole panel; words take only the height they need, at least half (a one-line reply about 60%), and it only grows while it speaks, so a shorter sentence doesn't make it jump; `press_pad_key` lets a keyboard type the PIN
  - the emulator's `?shape=notch` (or "Try: Mac notch"): 360 × 180 pt at 2x, cropped to the strip when closed
- **The app** (`apps/desktop`, Tauri 2: the system web view, not a bundled browser):
  - **The window:** borderless, above the menu bar on every Space and over full-screen apps, no Dock icon. It measures the real notch (`NSScreen` safe area and auxiliary areas) and draws a black pill at the top centre without one. On Windows the pill sits at the top centre too. The panel grows the window to the height the core asks for and brings it to the front; it shrinks after the close animation. Displays are re-measured every 4 s.
  - **The key:** a global push-to-talk shortcut that works in any app, press and release (⌥ Space on macOS, Ctrl Alt Space on Windows), changeable in Settings. The mic is open only while it's held.
  - **A menu-bar icon:** the charm's head as a template image (from `brand/build_icon.py`), with Settings… and Quit. Settings also opens from a right-click on the charm.
  - **Guided setup (approved by the maintainer, 5 October 2026):** the one way to set the charm up; Settings stays for changing things later. A window (`setup.html`, about 480 × 600 pt, the brand's paper and grid) with the real charm face at the top, reacting to each step and wearing the chosen name and colour from step 4; step dots, Back and Continue (Enter). It opens on a first run and whenever the app's own charmd has no usable folder (none, or gone), instead of Settings; **Set up again…** in the menu-bar menu reopens it (from the welcome once it's finished; at the folder step when the folder is gone). Each step saves through the same commands as Settings when you continue, so quitting halfway leaves a valid state, and the next start resumes at the first step not done. Six steps:
    1. **Welcome:** where the charm lives and the key, as this computer has it (⌥ Space on macOS, Ctrl Alt Space elsewhere): hold to talk, press to stop.
    2. **Your agent:** Claude Code, Codex, Gemini CLI, goose, Hermes, OpenClaw as cards marked Found or Not found (its command on the PATH charmd gets; on Windows with `PATHEXT` and npm's global folder); found ones first, the first selected; a missing one shows its install line and a link. "Another agent…" takes a command or a server, as in Settings. Sign-in isn't checked here: Try it shows it.
    3. **Your folder**, as an IDE's New Project:
       - **Create a new workspace:** a name (`my-charm` to start) and a location (the system's Documents folder, from Tauri, on every OS, or the home folder when there's none; the last one used is remembered) with Browse…, and the path it will create, in the OS's own form. The name must be a folder name valid on every OS (no `/ \ : * ? " < > |`, no trailing dot or space, not a Windows reserved name such as `CON` or `COM1`, at most 64 characters), and the target must not be a folder with files in it; Create stays off until both hold. Create makes the folder and runs `opencharm init` there with the chosen agent, showing progress; a missing `git` or network gets a plain error and Retry (a folder Create made is taken away again on a failure, so Retry finds the place free; an empty folder you chose yourself is left as it is).
       - **Use a folder I have:** the system picker; a workspace is used as its `opencharm.json` says, any other folder is the agent's working folder as it is.
    4. **Your charm:** name (from the workspace, Momo in the starter) and colour (spec 014: the six, or your own), saved to the workspace's `charm` block.
    5. **Voice:** speaking with Microsoft's voices (the default, with the note on what goes to Microsoft) or on this computer (and a macOS voice on a Mac); the language to fall back on; **Allow the microphone**, which asks now through the web view, and if refused says where to change it (macOS: System Settings → Privacy & Security → Microphone; Windows: Settings → Privacy → Microphone). Listening stays on this computer, with its one-time download noted.
    6. **Try it:** "Hold the key and say hi", following charmd's status and the first turn (heard you, your agent answered). A failure shows the status line's detail and Retry; **Finish anyway** closes it, to fix later in Settings. **Done** closes the window.
  - **Settings → Your agent:**
    - Folder (the system picker): an OpenCharm workspace (has `opencharm.json`) is used as configured; an empty folder offers **Create a workspace here** (`opencharm init`); any other folder is the agent's working folder as it is.
    - Agent: Claude Code, Codex, Gemini CLI, goose, Hermes, OpenClaw (ACP presets), a custom ACP command, or an OpenAI-compatible server by URL.
    - Voice: on this computer (`local`, macOS), OpenAI (the key in the keychain, given to charmd as `OPENAI_API_KEY`), or none (`fake`).
    - Voice, from spec 003's update: Listening and Speaking chosen separately, the language to fall back on, and the note on what the default voice sends to Microsoft; a workspace's own voice options (e.g. a Microsoft voice per language) are kept. An `opencharm` without the update (no `opencharm voice`) gets the old one-provider voice, and the status line says to update it. The download's progress shows in Settings' status line and on the setup's last step (from charmd's `status`, while it runs; 5 October 2026). With Microsoft's voices, Settings picks the voice for each language (from the service's list, checked 5 October 2026; its row has its own language choice, so the fallback language doesn't change), kept in the app's settings over the workspace's `voices` for the same language; charmd's default stays unless another is chosen, and a voice charmd would refuse is dropped when the settings load.
    - A status line (e.g. "Momo · Claude Code · ~/Desktop/momo · talking to charmd") and **Restart**.
  - **Typing (approved by the maintainer, 4 October 2026):** press ⌥⇧Space (Ctrl Alt Shift Space on Windows; changeable) or choose **Type to your charm…** in the menu-bar menu, and a one-line field opens in the panel. Clicking the charm keeps meaning "react" (OPENCHARM.md controls). Enter sends it to charmd as typed text (spec 001), Esc closes it; the reply comes back as text in the panel (spec 003: it answers the way you asked). One line and one reply, no history: longer work belongs in the agent's own chat.
- **Speak replies** (spec 003): a switch in the menu-bar menu and in Settings; off, every reply is text in the panel, even to a spoken question.
- **Settings, the rest:** the talk key, start at login, the update check. Advanced: another charmd's address (turns off the managed one), the CLI's path, forget the pairing. Saved as JSON and applied at once.
- **Its own charmd, inside the app** (approved by the maintainer, 5 October 2026: one install, nothing else to install):
  - Every release carries, as app resources: Node (an exact 24.x version, the official build with npm and `npx`, without headers and docs) and the `opencharm` CLI built from the same commit: its package files (`dist/`, `sim/`) and its production `node_modules`, installed from the repo's lockfile for the build's target (the matching native voice engine only).
  - The app runs it as `node <resources>/cli/dist/main.mjs` (no shebang or npm shim), for `serve`, `init` (Create a workspace) and the `--help` check. charmd and everything it starts get the bundled Node's folder first on their PATH, so `npx` (Claude Code's and Codex's ACP adapters) is the bundled one; agents that are Node tools (Gemini CLI, …) run on it too, accepted. The first start of an agent still downloads its adapter (network). `git` stays a requirement for creating a workspace.
  - Settings → Advanced can still point at another `opencharm`, run as today with its `CliFeatures` fallbacks; "missing" then means that path is wrong. A build from source without a staged bundle (`npm run desktop`) uses the installed CLI, as today, so contributors keep their loop.
  - The bundled CLI says the app's commit (`opencharm --version`, `status`); its version stays the CLI's own (`cli@0.0.0` from this build), on purpose: the app's identity is `desktop@x.y.z (commit)`.
  - macOS: the bundled files keep the signatures they ship with (`node` the Node.js Foundation's Developer ID, with the hardened-runtime entitlements Node needs, among them JIT and library validation off for native addons; the voice engine's libraries as npm ships them) and the app's ad hoc seal covers them all, so one Open Anyway covers the app and everything in it (changed while building: no re-signing needed, 5 October 2026).
  - Windows: `node.exe` and `npx.cmd`; charmd, Node and the agents stay in the app's job object.
    Its own config, state and admin socket in the app's data folder (on Windows a pipe with a random name for each run), on 127.0.0.1 and a free port the system gives it (port 0), so a terminal charmd on 8787 is untouched and nobody can hold its port first: the charm connects only to the `ws://127.0.0.1:<port>/charm` charmd announces on its own output, asks the app before every connection and waits while there's none (its eyes waking in the notch meanwhile, never a blank or half-drawn page), and reconnects to the new one after a restart without the page starting over; on Windows the admin pipe gets a fresh random name at each start of charmd; the app types its PIN, pairs or drops the pairing only for a page connected to that announced address, and types the PIN once the PIN screen is up (`pin_ready`), all at once, not on a timer. (changed 5 October 2026, from the security review of the PIN file: before, another user on the same computer could take the fixed port 8790 or pipe name while the app wasn't running and be sent the token and the PIN). It starts quietly: until the charm is unlocked the panel stays shut and the notch shows only the eyes waking (connecting, pairing again and the PIN are the app's plumbing); a lock from outside or a blocked charm shows at once, and after 15 s whatever is still wrong shows as it is (added 5 October 2026). Restarted with backoff if it stops, stopped when the app quits, its log in the app's log. On macOS a charmd left by a killed app is stopped on the next start (checked by pid file and command line). On Windows charmd and its agent run in a job object, so they end with the app even after a crash.
- **Automatic pairing** (`pairing.rs`): the app creates a random 12-digit PIN (no modulo bias), keeps it in an owner-only file in its data folder (`pin`, 0600 on macOS; the user's own folder on Windows; written to a temporary file and moved into place; replaced if it doesn't hold a PIN, and charmd's refusal then makes the app pair again), pairs through charmd's owner-only admin socket (re-pairing when "desktop" already exists), and types the PIN only on a boot lock, never after `opencharm lock`. The page side is `charmSim.onMessage` in `sim.js`. Another charmd pairs as a charm does: a code and a typed PIN.
- **The update check** (`updates.rs`): once a day the app reads GitHub's public release list for `desktop@` tags; a newer version is offered in the menu and Settings. Nothing about the user is sent. It can be turned off.
- **Bundling in the release:** a script (`apps/desktop/scripts/stage-charmd.ts`) stages the resources for a target; `desktop-release.yml` runs it in each platform's build job, and CI's `desktop` job runs it too, so a PR that breaks it fails.
  - Node is pinned in `apps/desktop/node.json` (version, and the SHA-256 of each target's archive); the download from nodejs.org is checked against it and the build fails on a mismatch. A bump checks the new archives against Node's signed `SHASUMS256.txt` and goes in as a `fix(desktop):`, so it releases (Dependabot doesn't cover it).
  - The Intel build runs on an Apple silicon runner: dependencies are installed for the target's OS and CPU, and the staged folder is checked to hold only that target's voice engine.
  - A desktop release now also follows `packages/cli`, `packages/charmd` and `packages/protocol` (the release planner's units and tests, CI's path filter, CONTRIBUTING's table): a CLI or charmd change releases the app too, with those notes, accepted.
  - Third-party notices include Node's licence and the bundled npm dependencies' licences.
- **Releases:** CI (`ci.yml`, job `desktop`) checks every PR that touches the app on macOS and Windows. `desktop-release.yml` releases the app from `main` (CONTRIBUTING, "Releasing"): after a merged `fix`/`feat`/`perf` that touches it, it builds macOS (Apple silicon, Intel) and Windows and publishes them as `desktop@<version>` on GitHub Releases, with `SHA256SUMS.txt` and build-provenance attestations. First release: `desktop@0.1.0`, 3 October 2026.
- Test-only environment variables (`OPENCHARM_FAKE_MIC`, `OPENCHARM_TEST_PIN`, `OPENCHARM_DATA`, …) are listed in `apps/desktop/README.md`.

## Decisions

- The desktop is one more platform for OpenCharm OS, around the same core; Tauri 2 rather than Electron, for size (maintainer, 1 October 2026).
- Pitch it as "the charm, without the hardware", not a notch status app. Notch and desktop apps for coding agents exist (Claude Peek, NotchAgent, Clawd on Desk and others, searched 1 October 2026), but none combines a hold-to-talk key that is also yes and no, ACP, MCP tools for the face and questions, and the hardware's firmware core.
- The app runs its own charmd from the CLI and Node it carries, not the installed CLI (maintainer, 5 October 2026; this replaces "the installed CLI; bundling Node is later", 1 October 2026). Measured for macOS on Apple silicon (5 October 2026): Node 24.21 about 140 MB unpacked (its `.tar.xz` 27 MB), the CLI with its dependencies 49 MB; so about 190 MB installed and roughly 50–60 MB to download (estimate: the `.dmg` isn't built yet; Windows and Intel not measured), for one install that always matches.
- The app pairs with its own charmd automatically through the admin socket, with a PIN typed by the app: same user, same computer, so no code or PIN for the user. charmd's security model is unchanged; hardware charms and another charmd keep the code and PIN (maintainer, 1 October 2026).
- The PIN lives in an owner-only file, not the keychain: an unsigned build's identity changes with every update, so macOS asked for the keychain item at each start, and the keychain added nothing here, because anything running as the user can already use charmd's owner-only admin socket (maintainer, 5 October 2026). An OpenAI key stays in the keychain.
- On Windows the pill sits at the top centre, the same layout as the Mac (maintainer, 1 October 2026).
- Releases are unsigned: open source with no paid signing identity; checksums, provenance and building it yourself instead (maintainer, 1 October 2026).

- Setup is a guided flow of its own, not a mode of Settings; creating a workspace works like an IDE's New Project (a name and a location, Documents by default), with no OpenCharm folder chosen for the user, and it works the same on every OS the app runs on: paths, keys, agent lookup and the microphone follow the platform (maintainer, 5 October 2026).

## Not in scope

Several agents at once, an automatic updater, Windows-specific folder conventions beyond the picker, a server agent's API key from Settings (only through a workspace's `opencharm.json` for now).

## Acceptance

- [x] The notch shape in the core: UI tests and snapshots for compact, speech, question and asleep, each checking nothing is drawn inside the notch or below the compact strip.
- [x] The emulator's notch mode: pairing with the PIN typed on the keyboard; an end-to-end test where the panel opens while it speaks and closes after.
- [x] The macOS window over the notch (pill without one), the panel growing and shrinking, rounded corners with no white edges.
- [x] The global talk key, press and release, changeable in Settings.
- [x] The menu-bar icon and Settings, saved as JSON and applied at once.
- [x] Settings: choose a folder, create a workspace in an empty one, choose the agent and the voice; the status line follows.
- [x] The managed charmd starts with the right config (unit tests for the config built from the settings), restarts after a crash (back in 1 s after `kill -9`), and stops with its agent on quit.
- [x] Automatic pairing and unlock with the app's PIN, verified in the built app (`OPENCHARM_DATA` throwaway folder, fake ACP agent, fake voice, fake mic): it paired, unlocked and ran one spoken turn with no code or PIN shown.
- [x] The PIN in an owner-only file, no longer read from the keychain (Rust tests: created 0600, reused, a bad file replaced); an install paired with the old keychain PIN pairs again by itself, once, with no prompt; the old keychain item is left as it is, unused, since deleting it could ask one last time (built app with `OPENCHARM_DATA`, 5 October 2026: refused, revoked, paired, unlocked, one turn).
- [x] Only its own charmd: port 0 and the announced address (Rust tests: only charmd's own loopback line is taken; a random pipe name); in the built app charmd came up on a random port, and after `kill -9` the charm reconnected only once the new charmd announced its new port and unlocked by itself (5 October 2026). Core test: the PIN screen says when it's ready.
- [x] Verified in the built app against a terminal charmd with the fake mic: pairing, the typed PIN, one spoken turn end to end.
- [x] Rust tests (geometry, settings, managed charmd, pairing) and clippy clean; `npm run check` green.
- [x] CI checks every PR that touches the app on macOS and Windows; `desktop-release.yml` publishes unsigned builds with checksums and provenance.
- [x] The maintainer's own run with the real microphone (a local build of `desktop@0.2.1`, 4 October 2026).
- [x] A real run with Momo's folder and Claude Code, by the maintainer (4 October 2026).
- [x] Typing: the field opens by shortcut and from the menu, Enter sends, Esc closes, the reply shows as text; the talk key still works while it's open (the maintainer, `desktop@0.7.0`, 5 October 2026).
- [x] Speak replies off from the menu: a spoken question gets a text reply (the maintainer, 5 October 2026).
- [ ] Windows on a real machine: the pill at the top centre, the key, the managed charmd ending with the app.

Bundled charmd:

- [x] The app runs its own charmd, before an installed one: install it, Open Anyway once, choose a folder and Claude Code, talk and type; the bundled `node` and the voice engine start (no "killed: 9", no second Gatekeeper prompt). The maintainer's Mac with `desktop@0.7.0`, 5 October 2026.
- [ ] The same on a Mac with no Node or CLI at all.
- [x] The bundled charmd matches the app: `opencharm status` through it (or the Settings footer) shows the app's commit (`desktop@0.7.0`'s bundled CLI says `cli@0.0.0 (9241935)`, the app's commit).
- [x] The release checks Node's download against its pinned SHA-256 and fails if it doesn't match; the Windows and Intel Mac builds carry their own Node and voice engine (`desktop@0.7.0` built for all three; the staging script refuses a mismatched archive or another target's engine).
- [ ] Another `opencharm` chosen in Settings → Advanced is still used, with the old-CLI fallbacks.
- [x] The download sizes per platform and the installed size on Apple silicon, recorded in `apps/desktop/README.md` (installed sizes on Intel and Windows not measured).
- [ ] The same on Windows on a real machine.
- [x] The docs it makes wrong, updated in the same PR: `apps/desktop/README.md` (no Node or CLI to install; the bundled charmd; sizes), `OPENCHARM.md` (the desktop section), CONTRIBUTING ("Releasing": the desktop unit's paths).

Guided setup:

- [ ] A first run opens the setup, not Settings; so does a folder that's gone; **Set up again…** reopens it; quitting halfway resumes at the first step not done (Rust tests for the resume state).
  - The rules are tested (`setup.rs`); in the built app a half-finished setup (step 3 done) started charmd and ran a turn whose events reached the setup window without an error (5 October 2026). Seeing the window open is the maintainer's run.
- [x] Agent detection finds a command on a PATH, with `PATHEXT` on Windows (Rust tests with a fake PATH; Windows CI runs them).
- [x] The new workspace's name rules and target check (Rust tests: reserved names, separators, trailing dot or space, a folder with files); Create makes `<location>/<name>` and runs `opencharm init` there.
- [ ] The whole flow in the built app with a throwaway `OPENCHARM_DATA`, the fake agent, voice and mic: create a workspace, name and colour it, one spoken turn on the Try it step; a screenshot of every step.
  - Every step rendered in headless Chrome with a stand-in for the app's commands, on macOS and Windows settings, and screenshotted (5 October 2026); the click-through in the built app is the maintainer's run.
- [ ] The same on Windows on a real machine.

## Notes

Resource use at rest, measured on an M-series MacBook (1 October 2026): about 2% of one core in total, charmd at 0%, about 75 MB for charmd and 80 MB for the app, a 4 MB app. Details in `apps/desktop/README.md`.

## Open questions

- An unsigned build changes identity with each update, so macOS may ask again for the microphone. Acceptable for now? (The keychain no longer asks: the PIN is in a file, 5 October 2026.)
- Accessibility: a shortcut that clashes with other apps, VoiceOver and Narrator, reduced motion.
