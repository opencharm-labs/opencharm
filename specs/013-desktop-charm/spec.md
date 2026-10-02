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
  - `on_panel` tells the platform when the panel opens and closes; `press_pad_key` lets a keyboard type the PIN
  - the emulator's `?shape=notch` (or "Try: Mac notch"): 360 × 180 pt at 2x, cropped to the strip when closed
- **The app** (`apps/desktop`, Tauri 2: the system web view, not a bundled browser):
  - **The window:** borderless, above the menu bar on every Space and over full-screen apps, no Dock icon. It measures the real notch (`NSScreen` safe area and auxiliary areas) and draws a black pill at the top centre without one. On Windows the pill sits at the top centre too. The panel grows the window and brings it to the front; it shrinks after the close animation. Displays are re-measured every 4 s.
  - **The key:** a global push-to-talk shortcut that works in any app, press and release (⌥ Space on macOS, Ctrl Alt Space on Windows), changeable in Settings. The mic is open only while it's held.
  - **A menu-bar icon:** the charm's head as a template image (from `brand/build_icon.py`), with Settings… and Quit. Settings also opens from a right-click on the charm.
  - **Settings → Your agent:**
    - Folder (the system picker): an OpenCharm workspace (has `opencharm.json`) is used as configured; an empty folder offers **Create a workspace here** (`opencharm init`); any other folder is the agent's working folder as it is.
    - Agent: Claude Code, Codex, Gemini CLI, goose, Hermes, OpenClaw (ACP presets), a custom ACP command, or an OpenAI-compatible server by URL.
    - Voice: on this computer (`local`, macOS), OpenAI (the key in the keychain, given to charmd as `OPENAI_API_KEY`), or none (`fake`).
    - A status line (e.g. "Momo · Claude Code · ~/Desktop/momo · talking to charmd") and **Restart**.
  - **Settings, the rest:** the talk key, start at login, the update check. Advanced: another charmd's address (turns off the managed one), the CLI's path, forget the pairing. Saved as JSON and applied at once.
- **Its own charmd** (`managed.rs`): started with the installed `opencharm` CLI (Node 24), found once through the login shell (`$SHELL -lc 'command -v opencharm'`) or a path in Settings; Settings says how to install it if missing. Its own config, state and admin socket in the app's data folder, on port 8790 so a terminal charmd on 8787 is untouched. Restarted with backoff if it stops, stopped when the app quits, its log in the app's log. On macOS a charmd left by a killed app is stopped on the next start (checked by pid file and command line). On Windows charmd and its agent run in a job object, so they end with the app even after a crash.
- **Automatic pairing** (`pairing.rs`): the app creates a random 12-digit PIN (no modulo bias), keeps it in the system keychain (macOS Keychain, Windows Credential Manager), pairs through charmd's owner-only admin socket (re-pairing when "desktop" already exists), and types the PIN only on a boot lock, never after `opencharm lock`. The page side is `charmSim.onMessage` in `sim.js`. Another charmd pairs as a charm does: a code and a typed PIN.
- **The update check** (`updates.rs`): once a day the app reads GitHub's public release list for `desktop@` tags; a newer version is offered in the menu and Settings. Nothing about the user is sent. It can be turned off.
- **Releases:** `desktop.yml` checks every PR on macOS and Windows. `desktop-release.yml` publishes macOS (Apple silicon, Intel) and Windows builds to GitHub Releases for a new `apps/desktop/package.json` version (run by hand on `main` while the repository is private; on every version change on `main` from launch), with `SHA256SUMS.txt` and build-provenance attestations (once the repository is public).
- Test-only environment variables (`OPENCHARM_FAKE_MIC`, `OPENCHARM_TEST_PIN`, `OPENCHARM_DATA`, …) are listed in `apps/desktop/README.md`.

## Decisions

- The desktop is one more platform for OpenCharm OS, around the same core; Tauri 2 rather than Electron, for size (maintainer, 1 October 2026).
- Pitch it as "the charm, without the hardware", not a notch status app. Notch and desktop apps for coding agents exist (Claude Peek, NotchAgent, Clawd on Desk and others, searched 1 October 2026), but none combines a hold-to-talk key that is also yes and no, ACP, MCP tools for the face and questions, and the hardware's firmware core.
- The app runs its own charmd with the installed CLI; bundling Node is later (maintainer, 1 October 2026).
- The app pairs with its own charmd automatically through the admin socket, with a keychain PIN typed by the app: same user, same computer, so no code or PIN for the user. charmd's security model is unchanged; hardware charms and another charmd keep the code and PIN (maintainer, 1 October 2026).
- On Windows the pill sits at the top centre, the same layout as the Mac (maintainer, 1 October 2026).
- Releases are unsigned: open source with no paid signing identity; checksums, provenance and building it yourself instead (maintainer, 1 October 2026).

## Not in scope

Bundling charmd inside the app, several agents at once, Windows-specific folder conventions beyond the picker, a server agent's API key from Settings (only through a workspace's `opencharm.json` for now).

## Acceptance

- [x] The notch shape in the core: UI tests and snapshots for compact, speech, question and asleep, each checking nothing is drawn inside the notch or below the compact strip.
- [x] The emulator's notch mode: pairing with the PIN typed on the keyboard; an end-to-end test where the panel opens while it speaks and closes after.
- [x] The macOS window over the notch (pill without one), the panel growing and shrinking, rounded corners with no white edges.
- [x] The global talk key, press and release, changeable in Settings.
- [x] The menu-bar icon and Settings, saved as JSON and applied at once.
- [x] Settings: choose a folder, create a workspace in an empty one, choose the agent and the voice; the status line follows.
- [x] The managed charmd starts with the right config (unit tests for the config built from the settings), restarts after a crash (back in 1 s after `kill -9`), and stops with its agent on quit.
- [x] Automatic pairing and unlock with the keychain PIN, verified in the built app (`OPENCHARM_DATA` throwaway folder, fake ACP agent, fake voice, fake mic): it paired, unlocked and ran one spoken turn with no code or PIN shown.
- [x] Verified in the built app against a terminal charmd with the fake mic: pairing, the typed PIN, one spoken turn end to end.
- [x] Rust tests (geometry, settings, managed charmd, pairing) and clippy clean; `npm run check` green.
- [x] `desktop.yml` checks every PR on macOS and Windows; `desktop-release.yml` publishes unsigned builds with checksums and provenance.
- [ ] The maintainer's own run with the real microphone.
- [ ] A real run with Momo's folder and Claude Code, by the maintainer.
- [ ] Windows on a real machine: the pill at the top centre, the key, the managed charmd ending with the app.

## Notes

Resource use at rest, measured on an M-series MacBook (1 October 2026): about 2% of one core in total, charmd at 0%, about 75 MB for charmd and 80 MB for the app, a 4 MB app. Details in `apps/desktop/README.md`.

## Open questions

- An unsigned build changes identity with each update, so macOS may ask again for the microphone and the keychain item. Acceptable for now?
- Accessibility: a shortcut that clashes with other apps, VoiceOver and Narrator, reduced motion.
