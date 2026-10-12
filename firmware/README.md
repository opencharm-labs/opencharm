# firmware/ — the charm (ESP32-S3)

Status: `core/` **built** (spec 005), `sim/` **built** (spec 006: the emulator, `opencharm sim`), `device/` **stages 1–3 of 4** (spec 009: face, key, touch, battery, status screen on the board; Wi-Fi setup and the connection to charmd, and the voice with echo cancellation, built and self-tested on the board; the checks that need a person wait for the maintainer).

## Decision

Build on [78/xiaozhi-esp32](https://github.com/78/xiaozhi-esp32) (MIT) instead of writing voice firmware from scratch, taking it by import: `device/` is our own ESP-IDF project that copies upstream files as each stage of spec 009 needs them, credited in `device/THIRD_PARTY_NOTICES.md`, instead of cloning all of its boards and deleting. It already provides, on ESP32-S3:

- offline wake word (ESP-SR)
- Opus audio streaming to a server over WebSocket (or MQTT + UDP)
- MCP on the device (the server/agent can call device tools)
- display support and a large list of boards, including Waveshare AMOLED boards
- a self-hostable server protocol: devices find their server through the OTA endpoint, so they can point at charmd

Waveshare publishes a XiaoZhi tutorial for this exact board: <https://docs.waveshare.com/ESP32-S3-Touch-AMOLED-2.16/XiaoZhi_AI>.
The board is **supported upstream**: [issue #1947](https://github.com/78/xiaozhi-esp32/issues/1947) closed in April 2026, and the board lives at [`main/boards/waveshare/esp32-s3-touch-amoled-2.16/`](https://github.com/78/xiaozhi-esp32/tree/main/main/boards/waveshare/esp32-s3-touch-amoled-2.16) (480×480, `AUDIO_INPUT_REFERENCE true`, 24 kHz codec rate, amp on GPIO46, BOOT on GPIO0). We follow upstream **v2.5.2** (11 October 2026), built with **ESP-IDF 6.1**; its build for this board turns on-device echo cancellation on. [Issue #2099](https://github.com/78/xiaozhi-esp32/issues/2099) (`BOARD_TYPE` missing in menuconfig) only affects building upstream itself.

Not chosen as the base: ESP-Claw and MimiClaw (they run the agent on the chip; we want a thin body for an agent that already exists). `esp-openclaw-node` is kept as an optional add-on for OpenClaw device commands; it has no audio or UI pipeline.

## Target board facts

From Waveshare's product page, docs and schematic ([repo](https://github.com/waveshareteam/ESP32-S3-Touch-AMOLED-2.16)):

| Part      | Chip / detail                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------- |
| SoC       | ESP32-S3R8, 8 MB PSRAM, 16 MB flash, Wi-Fi 2.4 GHz, BLE 5                                         |
| Display   | 2.16″ AMOLED 480 × 480, CO5300 driver (QSPI)                                                      |
| Touch     | CST9220                                                                                           |
| Audio out | ES8311 codec; NS4150B speaker amp, enable on GPIO46 (schematic); speaker built in                 |
| Audio in  | ES7210 ADC, two microphones, hardware echo reference                                              |
| Sensors   | QMI8658 IMU, PCF85063 RTC                                                                         |
| Power     | AXP2101 PMIC, MX1.25 battery connector                                                            |
| Buttons   | `+/KEY` = GPIO18 (the key: pull-up, low while pressed), PWR (also GPIO16, inverted), BOOT (GPIO0) |
| Other     | microSD, USB-C, I2C bus on GPIO14/15 shared by onboard chips, 9 solder pads (no Grove/Qwiic)      |

## Layout: one core, three platforms

Overview: [`OPENCHARM.md`](../OPENCHARM.md) ("OpenCharm OS and the emulator"); built by [spec 005](../specs/005-opencharm-os/spec.md), [spec 006](../specs/006-emulator/spec.md) and [spec 009](../specs/009-firmware-device/spec.md).

```
firmware/
  core/     charm-core: portable C++17, no ESP-IDF includes
            LVGL screens, glyph face renderer, state machine, charm protocol, gestures
  device/   the board (spec 009): an ESP-IDF 6.1 project that builds core/ as a component and
            implements the HAL with the board's drivers. Stage 1: screen, touch, key, battery
            and temperatures; then Wi-Fi + charmd, audio + echo cancellation (from xiaozhi-esp32)
  sim/      the emulator: the same core built to WebAssembly (Emscripten); the browser implements the HAL
```

- **HAL** (`core/include/charm/hal.h`, the only thing the core calls): `send_text`, `send_audio`, `mic_start`, `mic_stop`, `play_audio` (one 24 kHz Opus packet), `stop_audio`, `set_brightness`, `store_get`, `store_set`, `store_erase`, `reconnect`. The platform owns the LVGL display and input drivers, the WebSocket and the audio codecs (libopus on both targets), and reports events (key, touch, messages, audio, voice level) to `charm::App`; time is passed into `App` calls. The battery, temperatures, Wi-Fi and charmd reach `App::on_status` about once a second (spec 009); motion comes later.
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

**Build identity (spec 015):** CMake stamps the commit into `charm::kBuildCommit` (`-dirty` with local changes, `unknown` without git), and `AppOptions::build` (`kind`, `version`, `commit`) goes into the charm's `hello`. The emulator fills it from its host; the board fills it with kind `board` and `firmware@` plus its version.

## Screens (MVP)

1. **Boot**: the face wakes up, no logo: `− −` → `o o` → blink → `^ ^` (about 1.2 s); stays while Wi-Fi connects.
2. **Wi-Fi setup** (device only): hotspot `OpenCharm-XXXX`; the screen says "Join Wi-Fi OpenCharm-XXXX"; the setup page (78/esp-wifi-connect, in English) asks for the Wi-Fi network and password, and charmd's address under Advanced ("Custom OTA URL"). The charm then connects to that address's `/charm` (`charm_url`), with TLS for https. "No Wi-Fi" when the network drops; the hotspot reopens after a minute without Wi-Fi. When Wi-Fi works but charmd doesn't answer for 30 s: "No charmd. Hold the key 5 s for setup.", and holding the key 5 s on the connecting screen opens the hotspot (`Hal::open_setup`).
3. **Pairing**: a large 6-digit code in Geist Mono, a small face above, hint `opencharm pair 482913`; refreshes every 300 s.
4. **PIN pad**: 3×4 grid on true black, dots for entered digits; wrong → `x x` shake + "3 tries left"; blocked → `− −` + "Locked. Unlock from your computer."
5. **Face**: idle `o o` (blinks, glances); key held `O O`; released `o _ o` with cursor; speaking = eyes up, the line types out, the mouth flaps; error `x x` + one line; back to idle.
6. **Problems only**: "No Wi-Fi", "Can't reach charmd" on the face screen. No menus; settings live on the computer. One read-only status screen (touch and hold the face) shows battery, temperatures, Wi-Fi and charmd (spec 009).
7. **Battery** (spec 009): a small outline, its fill and the percent at the top centre, in the identity colour, never orange. Hidden at rest; shown for 3 s on wake and on a key press, and the whole time on USB (`62% · charging`); below 15 % a small outline stays. Only on the face.
8. **Status screen** (spec 009): touch and hold the face for 1 s (`kHoldMs`). The percent large (80 px), the state ("Charging", "On battery", "Full, on USB"), then one short line each: voltage, the power chip's and the ESP32-S3's temperatures, Wi-Fi, charmd, the build (dim). What isn't known says so ("—", "No Wi-Fi"). A tap, a key press or 10 s closes it, and that press does nothing else. A question or speech takes over from it.

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
1. **Bench check** (done, 12 October 2026): the board backed up and identified, the key found on the schematic (`+/KEY`, GPIO18), the speaker built in ([hardware/README.md](../hardware/README.md)).
1. **firmware/device**, spec 009 in four stages: (1) the face on the board, key, touch, battery and status screen (done, checked on the board); (2) Wi-Fi and charmd; (3) voice with echo cancellation; (4) dimming, CI build, docs. Its plan is `specs/009-firmware-device/plan.md`.
1. **Input on the board**: the key is GPIO18 (`+/KEY`). IMU (post-MVP): pick-up, face-down, shake.
1. **Post-MVP**: pocket and desk power modes (desk charges to 4.1 V), the 1.75 board, a browser flasher (ESP Web Tools / Web Serial).

## Building and flashing the board

Needs ESP-IDF 6.1 (`. $IDF_PATH/export.sh` in the shell first). From the repo root:

```bash
npm run device:build     # firmware/device → build/opencharm.bin
npm run device:flash     # board on USB; esptool finds the port
npm run device:monitor   # its log: battery, temperatures, the key (Ctrl+] quits)
```

- The device build compiles `core/` as an ESP-IDF component (`device/components/charm_core`), as C++17 like the other two platforms, and takes LVGL 9.6, cJSON and the screen and touch drivers from the ESP-IDF component manager (pinned in `device/dependencies.lock`). LVGL's settings are in `device/sdkconfig.defaults` and match `core/lv_conf.h`, except that LVGL's memory comes from the C library (PSRAM) on the board.
- One loop in the main task, as in the emulator: the key (debounced 20 ms), `App::tick`, `lv_timer_handler()`, every 16 ms; the battery and temperatures once a second. The screen takes partial renders from two 48-line buffers in internal DMA memory, swapped to big-endian and rounded to even pixels for the CO5300.
- The power chip's rails and charge settings are left as the board ships them; the firmware only switches on its battery-voltage and temperature measurements.
- Network (`device/main/network.cpp`): Wi-Fi and its setup hotspot from 78/esp-wifi-connect, the WebSocket from Espressif's `esp_websocket_client` (token as `Authorization: Bearer`, TLS checked with ESP-IDF's certificate bundle). Their events reach the core through a bounded queue drained by the main loop, so the core stays single-threaded. The token is stored with the origin that issued it (`token_origin`: scheme, host and port) and is sent only there: the open setup hotspot can't be used to redirect a paired charm and collect its token, not even by switching the same name from wss to plain ws.
- Voice (`device/main/audio.cpp`, from xiaozhi-esp32's BoxAudioCodec): ES8311 speaker and ES7210 mics + echo reference on one I2S bus at 16 kHz, esp-sr's AEC, Opus both ways (charmd's 24 kHz decoded straight to 16 kHz). The mic task runs only while the core has the mic on, and every capture is numbered so a press's audio never reaches the next hold; the speaker task plays a queue of up to 64 packets, numbered per reply so a stopped reply never plays on (it falls silent within about 150 ms), and keeps the speaker on 3 s between sentences. The audio task stacks and TLS buffers are in PSRAM, and so is any allocation over 1 KB (LVGL's included). `CONFIG_OPENCHARM_AUDIO_SELFTEST` (bench only) plays a tone and logs the reference, the mic and what echo cancellation leaves, runs the mic path for 1.2 s, and decodes charmd-like 24 kHz Opus at 16 kHz; on the reference board the echo dropped by about 34 dB.
- On the bench without a network: `CONFIG_OPENCHARM_BENCH_FACE` (`idf.py menuconfig`, OpenCharm; off by default) skips Wi-Fi and plays charmd's hello and "unlocked" to the core, so the face shows.
- CI (`device` job in `.github/workflows/ci.yml`) builds it in Espressif's `espressif/idf:v6.1` image whenever `firmware/` changes, and keeps `opencharm-waveshare-2.16.bin` (one image for address `0x0`) as an artifact.
- Back up before the first flash, and restore from that backup: [docs/build.md](../docs/build.md) section 5, and the `opencharm-device-flash` skill.
