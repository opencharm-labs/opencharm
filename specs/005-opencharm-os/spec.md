# 005: OpenCharm OS (firmware core)

Status: Done
Depends on: 001

## Why

OpenCharm OS behaviour must be written once and run identically on the charm and in the emulator. The core is portable C++ that only talks to a small HAL. Between events the face should feel alive: it breathes, hears you, gets bored and falls asleep, reacts when poked, and is pleased when it has helped, all inside the face rules (glyphs on true black, flat, no glow, orange only for "it needs you").

## Scope

- **`firmware/core`:** C++17, CMake, clang-format, no ESP-IDF includes; single-threaded and non-blocking.
- **HAL interface:** display flush and touch, key down/up, mic frames (libopus) and mic level (`on_mic_level(0..1)`, used only while talking), speaker, WebSocket, key-value storage, clock and timers, motion events, battery and Wi-Fi status.
- **State machine and protocol handling** (`App`), tested against `packages/protocol/fixtures`.
- **LVGL UI** (`LvglView`): the glyph face renderer (Geist Mono 800 bitmap fonts; faces, colours and states generated from `@opencharm-labs/design` into a C++ header), layouts face and speech, screens for boot, the Wi-Fi status line, the pairing code, the PIN pad, the face and problem lines. Sizes are fractions of the short side; a round-mask flag.
- **Input:** hold = talk (mic only while held), press = stop, dismiss, wake; tap = react; the screen dims after 60 s.
- **The alive face, motion** (`LvglView`, matched in `packages/design/src/charm-face.js`, the source of truth for faces, which honours reduced motion):
  - breathing: the face drifts up and down a little, slower and deeper when asleep
  - livelier eyes: double and slow blinks, darting glances; while thinking the eyes wander up, pondering
  - a squish on key press: the face squashes and bounces back
  - while you talk, the eyes pulse with your voice level; while you touch the screen, they look at your finger
- **The alive face, behaviour** (`App`, testable without pixels):
  - taps get a different reaction each time (a face and a short line: "Hehe.", "Hey!", "Boop.", a wink); three quick taps make it dizzy
  - after a long time with nothing happening it falls asleep (the sleepy face with floating z's); a key press, a tap or any message from charmd wakes it, surprised then happy
  - after it finishes speaking it looks pleased for a moment, even if charmd's idle face arrives meanwhile
  - on unlock it greets you ("Hi!")
  - never interrupted: questions, the PIN pad, speech and the "needs you" face; a face from charmd that needs the person shows at once
- **Tests:** a host build with a fake HAL and doctest unit tests; CI workflow `firmware`. Skill `opencharm-firmware`; `firmware/AGENTS.md`.

## Not in scope

The browser HAL (006), the ESP32 HAL (009), questions on the charm (011), the notch layout (013), new glyph faces, sounds, sensor-driven reactions (picked up, shaken: they come with the IMU work).

## Acceptance

- [x] Host tests: every protocol fixture handled; state machine transitions match `OPENCHARM.md`; key hold opens the mic only while held.
- [x] The generated face header matches `faces.json` (invariant check).
- [x] The layout renders at 480×480 square and 466×466 round in the host renderer (snapshot PNGs reviewed by hand).
- [x] `App` tests: tap reactions vary, three quick taps → dizzy, sleep and wake, pleased after speaking (it survives the idle face), greeting on unlock, squish on key down, voice level only while talking, needs-you shows at once, nothing covers a question, no sleep on a question.
- [x] UI tests: asleep, the face rises and falls ≥ 8 px between breaths; a squish shortens the face by more than 10 px; a loud voice grows the listening eyes by more than 20%.
- [x] The emulator computes the voice level from the microphone's PCM (RMS) and was rebuilt; the website's charms breathe and blink the same way.
- [x] Firmware tests and format, `npm run check`, end to end green.
