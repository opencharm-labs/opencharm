# 009 plan: stage 1, the face on the board

Stage 1 is done (12 October 2026): tasks 1–8 below, checked on the board by the maintainer. Next: stage 2 (Wi-Fi and charmd), planned here before it starts; it turns `CONFIG_OPENCHARM_BENCH_FACE` off and sends `charm` `battery` to charmd (protocol spec 001).

Goal of this stage: flash the 2.16 and see the OpenCharm face, reacting to the key and to taps, with the battery indicator and the status screen. No network yet. Stages 2 to 4 get their own section here when stage 1 is on the board.

## How the fork is taken

The spec says "hard fork of xiaozhi-esp32". Upstream is 154 boards; cloning it all and deleting is slower and leaves more to review than taking what we need. So `firmware/device` is a new ESP-IDF project that imports upstream files as each stage needs them, each with upstream's MIT notice and the commit it came from (`firmware/device/THIRD_PARTY_NOTICES.md`). Stage 1 imports nothing but facts (pins, the CO5300 init sequence; the AXP2101 needs no set-up, as Waveshare's board package shows) from `main/boards/waveshare/esp32-s3-touch-amoled-2.16/` at v2.5.2 (`49b4380`).

## Facts from upstream to keep (v2.5.2)

- I2C on SDA 15 / SCL 14, shared by the AXP2101 (0x34), touch, codecs, IMU and RTC.
- Upstream sets the AXP2101 rails (DC1 3.3 V, ALDO1 3.3 V for the mics, everything else off). Waveshare's board package sets none and the screen works, so stage 1 leaves them as shipped; stage 3 checks ALDO1 for the mics.
- Upstream sets the charge voltage to 4.1 V and the charge current register to 0x08. Stage 1 keeps the factory charge settings (doesn't write them) until the bench measures them; the gauge's percent is read from the AXP2101, never computed by us.
- CO5300 on QSPI (SPI2, CS 12, CLK 38, D0–D3 4/5/6/7, reset 39), 40 MHz, 32-bit commands, upstream's init table. Drawn areas must start on even pixels and end on odd ones (the CO5300 rounder): one `LV_EVENT_INVALIDATE_AREA` callback.
- Brightness: command 0x51 with 0–255.
- Touch CST9220 via the `cst9217` driver, I2C, reset 40, interrupt 11, mirrored on both axes.
- Key: GPIO18 (the button labelled `+/KEY`): 10 kΩ pull-up R18, low while pressed (schematic, then the serial log).

## Tasks

Each task: test first where it can be tested on the host, `npm run firmware:test` green, one commit.

1. **Battery in the core.** `View::set_battery(percent, charging, usb)`; `App::on_battery(percent, charging, usb, now)`. Rules in `App`: hidden at rest; shown 3 s after wake and after a key press; shown while on USB; a small marker while below 15 %. Tests in `app_test.cpp` (the recording fake view); drawing in `lvgl_view.cpp` (identity colour, never `kSignal`); snapshots for: hidden, shown, charging, low.
2. **Status screen in the core.** `struct Status` (battery percent, charging, usb, millivolts, board °C, chip °C, battery °C if known, Wi-Fi name and signal, charmd host and connected, build). `App::on_status(Status)` keeps the latest; `App::on_touch_hold(now)` opens it from the face (not during talk, a question, speech or the PIN); a key press, a tap or 10 s closes it, and the press doesn't also wake/stop. `View::show_status(const Status&)`. LVGL: long press 1 s on the face fires the hold; the click after a long press is ignored. Tests and snapshots (square 480 and round 466).
3. **Emulator.** Side panel: battery percent slider, charging and USB switches; the sim feeds `on_battery` and a `Status` with simulated temperatures and "emulator" values. Touch and hold works with the mouse. `npm run firmware:sim`, then a look in the browser.
4. **`firmware/device` project.** ESP-IDF 6.1, target esp32s3, 16 MB flash, PSRAM octal 80 MHz. Components: the core as an IDF component (`components/charm_core`, sources from `../../core`, our `lv_conf.h`), `lvgl/lvgl` 9.6.0, `espressif/esp_lcd_co5300`, `espressif/esp_lcd_touch_cst9217`. No `esp_lvgl_port`: the core is single-threaded, so one loop task calls `App::tick`, `lv_timer_handler` and reads input, like the emulator.
5. **Board bring-up** (`firmware/device/main/`): `board.cpp` (I2C, AXP2101, QSPI panel, touch, key), `display.cpp` (LVGL display, partial buffers in internal DMA RAM, flush through `esp_lcd_panel_draw_bitmap`, rounder), `power.cpp` (AXP2101 readings once a second: percent, charging, VBUS, battery voltage, die temperature; ESP32-S3 temperature sensor), `device_hal.cpp` (the `Hal`: brightness via 0x51, NVS store; network calls are no-ops until stage 2), `main.cpp` (the loop). Serial log of every reading once a second for the bench check.
6. **Build and flash commands.** `npm run device:build`, `npm run device:flash` and `npm run device:monitor` (ESP-IDF's `idf.py`, port auto-detected). As built, the display code lives in `board.cpp` (no separate `display.cpp`).
7. **Bench check of stage 1** with the maintainer: the face boots, key and taps react, battery and status values match the serial log on and off USB. Results into `hardware/README.md` and `docs/build.md`. Writing the backup back (restore) is not yet tried on this board; the factory image it matched is Waveshare's own.
8. **Docs and skill.** `docs/build.md` sections 4–5 (macOS/Linux/Windows flashing with esptool, backup first), `firmware/README.md`, `OPENCHARM.md`, `hardware/README.md` corrections (speaker onboard, button order, XiaoZhi v2.5.2 / ESP-IDF 6.1), and a skill `opencharm-device-flash` for building, backing up, flashing and restoring. No personal data: no names, home paths, network names, serial numbers or MAC addresses.

## Commands

```bash
npm run firmware:test        # core tests and snapshots, after tasks 1–2
npm run firmware:sim && npm run sim   # the emulator, after task 3
. $IDF_PATH/export.sh && npm run device:build   # after task 4
npm run device:flash         # after task 5, board in download mode
```
