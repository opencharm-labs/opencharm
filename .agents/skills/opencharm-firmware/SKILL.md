---
name: opencharm-firmware
description: Use when changing OpenCharm OS in firmware/ (the C++ core, its LVGL screens, the HAL, the emulator or device ports). Covers the core/HAL/View split, the rules the core must keep, fonts and faces, and how to test and review screens.
---

# OpenCharm OS (firmware)

One behaviour, three platforms: `firmware/core` (portable C++17) runs on the charm (`device/`, spec 009), in the emulator (`sim/`, spec 006) and in host tests. Detail: `firmware/README.md`; overview: `OPENCHARM.md` ("OpenCharm OS and the emulator").

## The split

- `include/charm/hal.h` is everything the core needs from a platform: send text/audio, mic start/stop, play/stop audio, brightness, key-value store, reconnect. Time is passed into calls, never read.
- `include/charm/view.h` is what the state machine asks the screen to show; `src/ui/lvgl_view.*` draws it with LVGL; tests use a recording fake.
- Life (spec 005): reactions go through `App::react` (a face and a line for a while, optionally a second face). Nothing covers a question, speech or the PIN; any agent state from charmd except idle cancels a reaction. Motion tests use `Headless::press`/`release` to hold the eyes still.
- Questions (`ask`): the decision layout (speech layout + orange ring + `HOLD · ALLOW    PRESS · NO`, two lines on round screens). A hold answers yes at 200 ms and never opens the mic; a press answers no; the question is capped at three lines.
- `include/charm/app.h` is the state machine. The platform feeds it events (`on_text`, `on_key`, `on_mic_frame`, …) and calls `tick(now)` every frame (~16 ms) plus `lv_timer_handler()`.

## Rules the core keeps (tests enforce them)

1. The mic opens only after the key is held 200 ms on the unlocked face, frames leave only while the key is down, key up always stops it.
2. Every server message goes through `parse_server_message` (never throws); the same fixtures as `packages/protocol` test it.
3. No exceptions, no RTTI, no threads, no blocking calls, no ESP-IDF includes in `core/`.
4. Orange (`kSignal`) appears only as the needs-you ring.

## Faces, fonts, sizes

- Faces and states come from `src/generated/faces.h` (`npm run design:export`); never hand-copy glyphs.
- Fonts are generated (`npm run firmware:fonts`) from `firmware/core/fonts/` into `src/ui/fonts/`; a new glyph in a face needs a font rebuild.
- Geometry follows `packages/design/src/charm-face.js`; sizes are fractions of the screen's short side; `ViewOptions.round` keeps content inside a circle.

## Test and review

```bash
npm run firmware:test          # configure, build, run the logic and UI tests
npm run firmware:format        # clang-format (CI runs firmware:format:check)
open firmware/core/build/snapshots/*.png   # every screen, square 480 and round 466
```

UI tests drive the real App + LvglView headless and check pixels; advance time in 16 ms frames (`Screen::at`) or easing and pops won't finish. Look at the PNGs after any visual change: tests catch regressions, eyes catch ugliness.
