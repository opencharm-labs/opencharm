# 009: Firmware device (Waveshare 2.16)

Status: In progress
Depends on: 005, board on the bench

## Why

The last MVP step. Everything else has already been proven on localhost through the same HAL in the emulator; this spec only swaps the HAL.

The same core on the real charm: AMOLED face, real key, echo cancellation, Wi-Fi setup, battery.

## Scope

Built in four stages, each flashed and checked on the board before the next starts, so the face is on the hardware first.

1. **Face on the board** (no network): an ESP-IDF app runs `firmware/core` with LVGL on the CO5300 screen, touch, the key on GPIO18 and the battery indicator. It boots to the face and reacts to the key and to taps.
2. **Wi-Fi and charmd:** Wi-Fi setup, the WebSocket to charmd, pairing, PIN and lock; the token in NVS; TLS checked with the ESP-IDF CA bundle.
3. **Voice:** mic while the key is held, Opus up at 16 kHz and down at 24 kHz, on-device echo cancellation with the hardware echo reference. Playback: charmd sends speech about 250 ms ahead of real time, paced on its clock across the reply (#29), so the board's Opus playback queue holds at least 250 ms plus one packet (Microsoft's voice sends 20 ms packets, the local voices up to 60 ms) and never drops a packet it was sent early.
4. **Power and release:** dim after 60 s; CI builds the firmware; flashing and restoring documented in `docs/build.md`.

What it's made of:

- `firmware/device`: an ESP-IDF 6.1 project (what upstream xiaozhi-esp32 v2.5.2 builds with) taking from upstream (MIT, credit kept) only what each stage needs: the board's facts, its Wi-Fi setup component, and later audio and echo cancellation. Nothing of xiaozhi.me: no defaults, activation, UI or assets. The WebSocket is Espressif's `esp_websocket_client`. LVGL is 9.6, the core's version.
- An ESP32 HAL implementation for the core (`core/include/charm/hal.h`).
- **Wi-Fi setup:** upstream's portal (78/esp-wifi-connect 3.3, used as a component): hotspot `OpenCharm-XXXX`, the screen says "Join Wi-Fi OpenCharm-XXXX", English page; charmd's address goes in its "Custom OTA URL" field under Advanced. With no saved network found within a minute, or no usable address, the hotspot opens again.
- **Finding charmd** (maintainer, 12 October 2026, for adding a board from the app, spec 013): with no address typed at Wi-Fi setup, the charm looks for `_opencharm._tcp` on the local network (mDNS), takes the first answer's host name (`<computer>.local`) and port, and saves `http://<computer>.local:<port>` as its address, so the pairing stays valid when the computer's IP changes. `.local` names are resolved by mDNS. The screen says "Looking for charmd…" meanwhile; a typed address always wins.
- **Battery:** the device reads the AXP2101 (percent, charging, on USB) and passes it to the core. The View shows it on the face: hidden at rest; a small level in the identity colour for 3 s on wake and on a key press, and while on USB; a small marker that stays while below 15 %. Never orange (orange means "it needs you"). The emulator gets a battery control in its side panel, so the indicator is tested without the board. The charm also sends its battery to charmd (`charm` `battery`, protocol spec 001), which shows it in `opencharm status`; an agent tool for it is proposed in spec 012.
- **Status screen:** touch and hold the face for 1 s to open it; a key press, a tap or 10 s without touch closes it. Read-only, large type in Geist Mono on true black, one item per line:
  - battery: percent in large type, then charging / on USB / on battery, and the voltage
  - temperatures: the board's (AXP2101) and the chip's (ESP32-S3 sensor); the battery's own only if its pack has a thermistor (unverified until checked)
  - Wi-Fi: network name and signal strength; charmd: connected or not, and its host
  - what it runs: the firmware's version and core commit (spec 015 puts the identity here, never on the face)

  Stage 1 shows battery, temperatures and the identity; stage 2 adds Wi-Fi and charmd. The emulator shows the same screen with its simulated values.

- Key on GPIO18; touch; boot screen.

## Decisions

- Battery is a core feature of the charm, not post-MVP: it must always be shown correctly, and its look above is approved (maintainer, 12 October 2026).
- The charm gets one read-only status screen for battery, temperatures, Wi-Fi and charmd, in large type (maintainer, 12 October 2026). It changes nothing, so "settings live on the computer" still holds; touch and hold opens it because hold-to-talk is on the key, not the screen.
- Built from XiaoZhi v2.5.2 on ESP-IDF 6.1, not v2.4 on 6.0: upstream moved there (release of 11 October 2026).
- Upstream's Wi-Fi portal is reused instead of writing our own page: fewer parts, same result.
- The board connects straight to the address typed at Wi-Fi setup (scheme, host and port; path `/charm`) instead of first asking charmd's `/ota/` where to go: the `/ota/` answer comes over plain HTTP on a home network and could send the charm, with its token, somewhere else. `/ota/` stays for stock XiaoZhi devices. Proposed in the stage 2 pull request; the maintainer confirms it there.
- The pairing token is bound to the origin that issued it (scheme, host and port) and never sent anywhere else, not even to the same host without TLS: the setup hotspot is open (as upstream's) and reopens when the saved network can't be found, so anyone nearby could change the address; a charm pointed somewhere new pairs again (stage 2 security review, 12 October 2026).
- Holding the key 5 s while the charm isn't connected opens Wi-Fi setup, so a wrong charmd address can be fixed without a reflash; the hotspot doesn't open by itself just because charmd is quiet (its computer may be asleep). Proposed in the stage 2 pull request; the maintainer confirms it there.
- The fork is taken by import: `firmware/device` is a new ESP-IDF project that copies upstream files as each stage needs them, each credited with its commit, instead of cloning 154 boards and deleting (plan.md).

## Not in scope

IMU modes, desk charge limit, the 1.75 board, browser flasher (post-MVP).

## Acceptance

- [x] Stage 1: the face boots on the board, the key and taps react, and the battery indicator matches the AXP2101 reading on and off USB (manual check with the serial log; maintainer, 12 October 2026).
- [x] The battery indicator in the emulator: hidden at rest, shown on wake and on USB, marker below 15 % (UI snapshots in `npm run firmware:test`; `packages/cli/e2e/status.e2e.test.ts`).
- [x] The status screen opens on touch and hold, closes on press, tap or 10 s, and shows values that match the serial log on the board (UI snapshots, `status.e2e.test.ts`, then a manual check on the board, 12 October 2026).
- [ ] MVP definition of done (CONTRIBUTING, "Testing and definition of done") passes on the device, including a phone hotspot.
- [ ] Echo cancellation confirmed running (talk over playback test). Measured on the board without a person: the echo of a test tone drops by 33.5 dB while room sound passes unchanged (bench self-test, plan.md stage 3); talking over a reply waits for the maintainer.
- [ ] "Key released → first audio" measured on the device and recorded in `OPENCHARM.md`.
- [x] The charm reports its battery to a charmd that offers it, once unlocked and on change, and `opencharm status` shows it; a charmd that doesn't offer it gets nothing (core tests, `daemon.test.ts`, the CLI's status test, `status.e2e.test.ts`).
- [x] CI builds the device firmware (`device` job in `ci.yml`, with a flashable image as an artifact).
