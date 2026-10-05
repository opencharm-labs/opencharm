# 009: Firmware device (Waveshare 2.16)

Status: Draft
Depends on: 005, board on the bench

## Why

The last MVP step. Everything else has already been proven on localhost through the same HAL in the emulator; this spec only swaps the HAL.

The same core on the real charm: AMOLED face, real key, echo cancellation, Wi-Fi setup, battery.

## Scope

- Bench check first (`docs/build.md` section 4): speaker plug, GPIO18 button, stack depth, battery measurements; answers into `OPENCHARM.md`.
- `firmware/device`: hard fork of 78/xiaozhi-esp32 (MIT, credit kept), ESP-IDF 6.0; remove xiaozhi.me defaults, activation, their UI and assets; keep board support, audio + echo cancellation, WebSocket, Wi-Fi setup and the config check (charmd `/ota/`).
- ESP32 HAL implementation for the core; token in NVS; certificate check with the ESP-IDF CA bundle.
- Playback: charmd sends speech about 250 ms ahead of real time, paced on its clock across the reply (#29), so the board's Opus playback queue holds at least 250 ms plus one packet (Microsoft's voice sends 20 ms packets, the local voices up to 60 ms) and never drops a packet it was sent early.
- Wi-Fi setup: hotspot `OpenCharm-XXXX` + our setup page (network, password, charmd address).
- Boot screen; key on GPIO18; touch; power: dim after 60 s.
- CI builds the device firmware.

## Not in scope

IMU modes, desk charge limit, the 1.75 board, browser flasher (post-MVP).

## Acceptance

- [ ] MVP definition of done (`OPENCHARM.md`) passes on the device, including phone hotspot.
- [ ] Echo cancellation confirmed running (talk over playback test).
- [ ] "Key released → first audio" measured on the device and recorded in `OPENCHARM.md`.
