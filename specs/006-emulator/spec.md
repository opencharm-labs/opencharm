# 006: Emulator

Status: Done
Depends on: 003, 005

## Why

Until the board arrives, and for UI work after, we need the real charm experience on any computer: the same core code, real audio, real WebSocket to charmd.

## Scope

- `firmware/sim`: the core compiled to WebAssembly with Emscripten, rendering to a canvas (no SDL: see the plan), browser mic/speaker, libopus, browser WebSocket.
- Page: the 480×480 screen inside a drawing of the charm (square, round option); Space = the key; mouse = tap and PIN pad; side panel: pick up, face-down, shake, battery level, Wi-Fi drop.
- `opencharm sim`: serves the prebuilt WebAssembly from the CLI package on localhost and opens the browser; runs on macOS, Windows, Linux.
- Build artefacts published inside `packages/cli` (not committed to git).
- Skill `opencharm-emulator`.

## Not in scope

Echo cancellation, Wi-Fi setup screens, flash wear, battery life (device only, 011).

## Acceptance

- [x] On macOS (headless Google Chrome, fake microphone): the emulator pairs with a local charmd, the PIN pad works, a spoken question to the fake agent plays back (`npm run test:e2e -w packages/cli`, also in CI on Ubuntu). Windows not tried yet; the build is plain WebAssembly + a web page, and CI covers Linux.
- [ ] On localhost with the `claude-code` adapter and the real microphone: to do together with the maintainer (items 1–3 of the definition of done). Items 1–3 pass with the fake agent and microphone. **Deferred**: the maintainer's real-mic run (spec 013).
- [ ] Against the droplet (after 009): the MVP definition of done items 1–3 pass in the emulator. **Deferred**: moved to spec 007 (droplet deploy).
- [x] Rendering matches the host snapshots from 007 (same code; screenshots in `firmware/sim/build/e2e/`).
