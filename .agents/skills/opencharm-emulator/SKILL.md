---
name: opencharm-emulator
description: Use when running, changing or testing the OpenCharm emulator (firmware/sim, `opencharm sim`), or when you need a charm on screen to try charmd, a face or a flow without hardware.
---

# The OpenCharm emulator

The charm in a browser tab: `firmware/core` compiled to WebAssembly, so it behaves exactly like the device. Only the HAL differs (`firmware/sim/src/sim_platform.cpp` + `firmware/sim/web/sim.js`).

## Run it

```bash
npm run firmware:sim            # build (Emscripten) → packages/cli/sim/
npm run cli -- serve            # charmd, in another terminal (fake voice + agent unless configured)
npm run cli -- sim              # opens http://127.0.0.1:5174 (--url <charmd ws url>, --port, --no-open)
npm run cli -- pair <code>      # the code on the emulator's screen; then type the PIN on the canvas
```

Hold **Space** (or the key on the right) to talk; a short press stops speech; click the face to tap it. Side panel: drop Wi-Fi, square/round, forget pairing.

## How it fits

- Pixels: LVGL renders to a framebuffer; `sim.js` copies it to the canvas each frame.
- Input: pointer and Space go straight into exported `sim_*` functions.
- Audio: mic at 16 kHz through an AudioWorklet (`mic-worklet.js`), 60 ms frames encoded to Opus in WebAssembly; the core decides if a frame may leave (the mic rule). Speech: Opus decoded in WebAssembly at 24 kHz, scheduled on a 24 kHz AudioContext.
- Connection: browsers can't set WebSocket headers, so the token rides as the subprotocol `opencharm.token.<token>` (charmd answers `opencharm`); tokens never go in URLs.
- `window.__charm` exposes what the page received (for tests and debugging).

## Test

```bash
npm run test:e2e -w packages/cli   # headless Google Chrome, fake microphone, real charmd: pair → PIN → a spoken turn
```

Screenshots land in `firmware/sim/build/e2e/`. The real microphone is never used by tests (Chrome's fake device plays a generated tone).

- The microphone is open only while the key is held (`openMic` on key down, `closeMic` on key up in `web/sim.js`); never keep a stream open between holds. The end-to-end test checks it (`micReady`, `micOpens`).
- Shapes: `?shape=square` (default), `round`, `notch` (the desktop charm, spec 013: the panel under a Mac's notch; the PIN is typed on the keyboard). The view reports the notch panel opening and closing through `charmSim.panel`.
