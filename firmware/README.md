# firmware/ — the charm (ESP32-S3)

Status: `core/` **built** (spec 005) and `sim/` **built** (spec 006: the emulator, `opencharm sim`); `device/` (spec 009) not started.

## Decision

Fork [78/xiaozhi-esp32](https://github.com/78/xiaozhi-esp32) (MIT) instead of writing voice firmware from scratch. It already provides, on ESP32-S3:

- offline wake word (ESP-SR)
- Opus audio streaming to a server over WebSocket (or MQTT + UDP)
- MCP on the device (the server/agent can call device tools)
- display support and a large list of boards, including Waveshare AMOLED boards
- a self-hostable server protocol: devices find their server through the OTA endpoint, so they can point at charmd

Waveshare publishes a XiaoZhi tutorial for this exact board: <https://docs.waveshare.com/ESP32-S3-Touch-AMOLED-2.16/XiaoZhi_AI>.
The board is **supported upstream**: [issue #1947](https://github.com/78/xiaozhi-esp32/issues/1947) closed in April 2026, and the board lives at [`main/boards/waveshare/esp32-s3-touch-amoled-2.16/`](https://github.com/78/xiaozhi-esp32/tree/main/main/boards/waveshare/esp32-s3-touch-amoled-2.16) (480×480, `AUDIO_INPUT_REFERENCE true`, 24 kHz codec rate, amp on GPIO46, BOOT on GPIO0). Plan the fork around recent upstream changes: v2.4.0 moved to **ESP-IDF 6.0** (July 2026), boards were reorganised into vendor folders (PR #2153), and [issue #2099](https://github.com/78/xiaozhi-esp32/issues/2099) (`BOARD_TYPE` missing in menuconfig) was open on 29 September 2026.

Not chosen as the base: ESP-Claw and MimiClaw (they run the agent on the chip; we want a thin body for an agent that already exists). `esp-openclaw-node` is kept as an optional add-on for OpenClaw device commands; it has no audio or UI pipeline.

## Target board facts

From Waveshare's product page, docs and schematic ([repo](https://github.com/waveshareteam/ESP32-S3-Touch-AMOLED-2.16)):

| Part      | Chip / detail                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| SoC       | ESP32-S3R8, 8 MB PSRAM, 16 MB flash, Wi-Fi 2.4 GHz, BLE 5                                                        |
| Display   | 2.16″ AMOLED 480 × 480, CO5300 driver (QSPI)                                                                     |
| Touch     | CST9220                                                                                                          |
| Audio out | ES8311 codec; NS4150B speaker amp, enable on GPIO46 (schematic), 2-pin speaker header P10; no speaker in the box |
| Audio in  | ES7210 ADC, two microphones, hardware echo reference                                                             |
| Sensors   | QMI8658 IMU, PCF85063 RTC                                                                                        |
| Power     | AXP2101 PMIC, MX1.25 battery connector                                                                           |
| Buttons   | PWR, BOOT (GPIO0), user button GPIO18                                                                            |
| Other     | microSD, USB-C, I2C bus on GPIO14/15 shared by onboard chips, 9 solder pads (no Grove/Qwiic)                     |

## Layout: one core, three platforms

Overview: [`OPENCHARM.md`](../OPENCHARM.md) ("OpenCharm OS and the emulator"); built by [spec 005](../specs/005-opencharm-os/spec.md), [spec 006](../specs/006-emulator/spec.md) and [spec 009](../specs/009-firmware-device/spec.md).

```
firmware/
  core/     charm-core: portable C++17, no ESP-IDF includes
            LVGL screens, glyph face renderer, state machine, charm protocol, gestures
  device/   planned (spec 009), not in the repo yet: a hard fork of 78/xiaozhi-esp32
            (MIT, credit kept), ESP-IDF 6.0, whose drivers implement the HAL:
            screen, touch, key, audio + echo cancellation, Wi-Fi, WebSocket, flash
  sim/      the emulator: the same core built to WebAssembly (Emscripten); the browser implements the HAL
```

- **HAL** (`core/include/charm/hal.h`, the only thing the core calls): `send_text`, `send_audio`, `mic_start`, `mic_stop`, `play_audio` (one 24 kHz Opus packet), `stop_audio`, `set_brightness`, `store_get`, `store_set`, `store_erase`, `reconnect`. The platform owns the LVGL display and input drivers, the WebSocket and the audio codecs (libopus on both targets), and reports events (key, touch, messages, audio, voice level) to `charm::App`; time is passed into `App` calls. Motion, battery and Wi-Fi status come later.
- **Core rules**: single-threaded and non-blocking (required by browsers; good firmware practice); all sizes are fractions of the screen's short side, with a round-mask flag, so the same layout runs on 480×480 square and 466×466 round.
- **Removed from XiaoZhi**: xiaozhi.me defaults and the activation flow (the charm never contacts their cloud), their UI, emoji packs, fonts and sounds; the wake word is off in the MVP build.
- **Kept**: board support, audio pipeline and echo cancellation, WebSocket transport, Wi-Fi setup and the config check (answered by charmd at `/ota/`).

## The core (spec 005, built)

C++17 without exceptions or RTTI, LVGL 9.6, cJSON.

- `charm::App` is the state machine. It goes boot (1.2 s) → connecting → pairing → PIN pad / blocked → face (idle, listening, thinking, speaking) and back to the PIN pad on a remote lock. `revoked` erases the token and reconnects; a dropped connection shows "Can't reach charmd".
- It reaches the platform only through `charm::Hal`, and draws through `charm::View`.
- `charm::LvglView` ports the browser face engine (`packages/design/src/charm-face.js`): the same geometry (eyes 0.34 × the short side, 0.215 apart, centre at 46 %; the speech layout shrinks to 0.58× and moves to 22 %, text from 50 % down, 82 % wide), ink-centred glyphs, blink, glance, pop, cursor, the typed line with mouth flap, the orange needs-you ring, the PIN pad (touch), pairing, blocked and connecting screens.
- **The mic rule is enforced here.** The mic is on only while the key is down. Its frames wait in memory (a pre-roll of up to 16) until the key has been held 200 ms: then `listen start` goes out with them, so the first word isn't cut. Shorter is a press (stop speech, dismiss a line, wake), and the pre-roll is dropped: nothing left the charm. Not while the charm speaks (that press is a stop), and never on a question (hold = yes). The face reacts at key-down. The firmware sends `listen start` only while the key is physically held.
- Input: hold key = talk (`listen` `manual`), or "yes" on the needs-you ring; press = stop speaking / dismiss / wake the screen / "no"; tap face = a varied reaction (spec 005; three quick taps make it dizzy).
- The look (spec 014): charmd's `charm:look`, sent before every unlock and on any change, sets the identity colour of the glyphs and text, as in `charm-face.js` (eyes, mouth, z's, captions, the PIN pad and the pairing code; dim parts stay dim, and the orange ring never changes), the greeting after unlock (empty = no line; "Hi!" until a look arrives), the sleep delay (0 = never; 4 min until a look arrives) and calm motion (breathing and blinks, no glances, squash or voice swell). It's held in memory only.
- Power (MVP): the screen dims after 60 s idle (20 % brightness), and a key or touch wakes it. Pocket mode (IMU), desk mode and the 4.1 V desk charge limit are post-MVP ([hardware/README.md](../hardware/README.md)).
- **Cheap at rest**: the face draws a frame only when something on it moved. LVGL is touched only when a glyph's text, font, scale, rotation or position really changes, and the z's move in 12 steps. A face at rest draws a few frames a second (blinks, breath steps), not 60. A UI test holds this: fewer than 60 frames in 9.6 s.
- Fonts: Geist Mono (ExtraBold, Medium) and one `♥` from Noto Sans Symbols 2, converted with `lv_font_conv` to LVGL bitmap fonts at 163/95/57 px (glyphs), 80 px (digits), 35/24 px (text), all under SIL OFL (`npm run firmware:fonts`). Faces, colours and states come from `packages/design/faces.json` (generated into `core/src/generated/faces.h`); motion from `packages/design/tokens.json`.
- Tests: the C++ protocol code runs over `packages/protocol/fixtures`, the state machine runs with a fake HAL and view, and headless UI tests check real pixels and save PNG snapshots to `firmware/core/build/snapshots/` (square 480 and round 466).

**Build identity (spec 015):** CMake stamps the commit into `charm::kBuildCommit` (`-dirty` with local changes, `unknown` without git), and `AppOptions::build` (`kind`, `version`, `commit`) goes into the charm's `hello`. The emulator fills it from its host; the board port (spec 009) will fill it with its own `firmware@` release.

## Screens (MVP)

1. **Boot**: the face wakes up, no logo: `− −` → `o o` → blink → `^ ^` (about 1.2 s); stays while Wi-Fi connects.
2. **Wi-Fi setup** (device only): hotspot `OpenCharm-XXXX`; the screen says "Join Wi-Fi OpenCharm-XXXX"; a setup page in our style asks for the Wi-Fi network, password and charmd address.
3. **Pairing**: a large 6-digit code in Geist Mono, a small face above, hint `opencharm pair 482913`; refreshes every 300 s.
4. **PIN pad**: 3×4 grid on true black, dots for entered digits; wrong → `x x` shake + "3 tries left"; blocked → `− −` + "Locked. Unlock from your computer."
5. **Face**: idle `o o` (blinks, glances); key held `O O`; released `o _ o` with cursor; speaking = eyes up, the line types out, the mouth flaps; error `x x` + one line; back to idle.
6. **Problems only**: "No Wi-Fi", "Can't reach charmd" on the face screen. No menus; settings live on the computer.

## Emulator (spec 006, built)

`firmware/sim` compiles `firmware/core` and libopus 1.6.1 to WebAssembly (Emscripten 6.0.10). `opencharm sim` serves it on `http://127.0.0.1:5174` and opens it in any browser (macOS, Windows, Linux); `npm run firmware:sim` builds it into `packages/cli/sim/`, which ships in the npm package and isn't committed. It connects to charmd at `ws://127.0.0.1:8787/charm` by default (`--url` for a `wss://` one); `opencharm dev ...` pushes faces, lines and locks to it. Space = the key; mouse = tap and PIN pad. Used for all work until the board arrives, and for UI work after.

- **No SDL.** LVGL renders into a framebuffer that the page copies to a canvas, and input goes straight into exported functions. Fewer parts than the SDL route first planned, with the same outcome.
- **Cheap at rest:** LVGL renders in direct mode, so only the areas that changed are drawn, and the page copies only their bounding box. The loop ticks at 60 Hz while something animates or the key is held, and at 10 Hz at rest; input and messages wake it at once. The speaker's AudioContext is suspended 2 s after the last sound.
- **Audio in the browser:** the mic runs at 16 kHz through an AudioWorklet, and 60 ms frames are encoded to Opus in WebAssembly. The microphone is opened when the key goes down and closed when it comes up, so the browser shows it recording only while the key is held; it asks for no echo cancellation, noise suppression or gain control, because the charm never plays while the mic runs and on macOS those make WebKit use Apple's voice-processing unit, which ducks other sound and is expected to start slower (not measured yet). `__charm.micLatencyMs` (and the console) give the time from key-down to the first 60 ms frame the core took, so 60 ms is the floor. The core still decides which frames leave (after a 200 ms hold). Speech is decoded at 24 kHz. The status line says "MIC ON" while capture runs; sound out starts at the first click or key press.
- **The token rides as a WebSocket subprotocol** (`opencharm.token.<token>`), because browsers can't set other headers on a WebSocket; tokens never go in URLs (spec 007's security review).
- **Side panel:** what it runs (the CLI or desktop app that ships it, with the core's commit; spec 015; never on the charm's screen), drop Wi-Fi, square/round screen, forget pairing. Motion and battery controls wait for the motion-sensor work after the MVP.
- **Tested end to end** in headless Google Chrome with a fake microphone against a real charmd: pair, type the PIN on the canvas, hold Space, and the spoken answer comes back (`npm run test:e2e -w packages/cli`; also in CI, `ci.yml`).
- **Can't prove**: the board's echo cancellation and mic quality, Wi-Fi, battery life, flash. Those are tested on the board.

## Work plan

1. **firmware/core** (done, spec 005): HAL, state machine, protocol, glyph face and screens, host tests and snapshots (`npm run firmware:test`).
1. **emulator** (done, spec 006): the core in WebAssembly, `opencharm sim`, tested end to end in headless Chrome.
1. **Bench check** (board arrives): flash Waveshare's XiaoZhi build; confirm screen, touch, both mics, speaker, battery charging; find the GPIO18 button.
1. **firmware/device**: fork upstream (v2.4+, ESP-IDF 6.0; watch issue #2099), implement the HAL for the 2.16, confirm echo cancellation runs (`AUDIO_INPUT_REFERENCE true` in the upstream board config; an earlier reading of `main/Kconfig.projbuild` suggested AEC might be dropped, so verify with a build).
1. **Input on the board**: the key is GPIO18 on the 2.16 (which side button is _unverified_). IMU (post-MVP): pick-up, face-down, shake.
1. **Post-MVP**: pocket and desk power modes (desk charges to 4.1 V), the 1.75 board, a browser flasher (ESP Web Tools / Web Serial).

## Flashing and restoring

- Download mode: hold **BOOT** while connecting USB-C (or power-cycling).
- Waveshare's guide uses Espressif's Flash Download Tool, ESP32-S3, USB, address `0x00`: <https://docs.waveshare.com/ESP32-S3-Touch-AMOLED-2.16/Firmware-Flashing>.
- The factory firmware `.bin` is in the `firmware` folder of Waveshare's repo; flashing it restores the device.
