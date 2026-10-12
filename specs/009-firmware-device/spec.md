# 009: Firmware device (Waveshare 2.16)

Status: Approved
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

- `firmware/device`: hard fork of 78/xiaozhi-esp32 v2.5.2 (MIT, credit kept), ESP-IDF 6.1 (what upstream builds with). Removed: xiaozhi.me defaults, activation, their UI and assets. Kept: board support for the 2.16, audio and echo cancellation, WebSocket, Wi-Fi setup and the config check (charmd `/ota/`). LVGL moves from upstream's 9.5 to 9.6, the core's version.
- An ESP32 HAL implementation for the core (`core/include/charm/hal.h`).
- **Wi-Fi setup:** upstream's portal (78/esp-wifi-connect), renamed: hotspot `OpenCharm-XXXX`, the screen says "Join Wi-Fi OpenCharm-XXXX", and the portal's server-address field is labelled "charmd address".
- **Battery:** the device reads the AXP2101 (percent, charging, on USB) and passes it to the core. The View shows it on the face: hidden at rest; a small level in the identity colour for 3 s on wake and on a key press, and while on USB; a small marker that stays while below 15 %. Never orange (orange means "it needs you"). The emulator gets a battery control in its side panel, so the indicator is tested without the board. The charm also sends its battery to charmd (`charm` `battery`, protocol spec 001), so the agent can know it.
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

## Not in scope

IMU modes, desk charge limit, the 1.75 board, browser flasher (post-MVP).

## Acceptance

- [ ] Stage 1: the face boots on the board, the key and taps react, and the battery indicator matches the AXP2101 reading on and off USB (manual check with the serial log).
- [ ] The battery indicator in the emulator: hidden at rest, shown on wake and on USB, marker below 15 % (UI snapshots in `npm run firmware:test`).
- [ ] The status screen opens on touch and hold, closes on press, tap or 10 s, and shows values that match the serial log on the board (UI snapshots, then a manual check on the board).
- [ ] MVP definition of done (CONTRIBUTING, "Testing and definition of done") passes on the device, including a phone hotspot.
- [ ] Echo cancellation confirmed running (talk over playback test).
- [ ] "Key released → first audio" measured on the device and recorded in `OPENCHARM.md`.
- [ ] CI builds the device firmware.
