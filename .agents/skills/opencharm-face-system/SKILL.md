---
name: opencharm-face-system
description: Use when adding or changing a charm face (mood), colour or agent state, or any code that renders faces (web, CLI, firmware, emulator). Covers the source of truth, regeneration and the face rules.
---

# OpenCharm face system

## Source of truth

`packages/design/src/charm-face.js` defines faces (`FACES`, `ORDER`), colours (`COLORS`), states (`STATES`) and the signal colour. Everything else is generated or reads the generated data:

- `npm run design:export` → `packages/design/faces.json` (checked for freshness by `npm test`).
- TypeScript reads it through `@opencharm-labs/design/faces` (`facesData`) with types from `@opencharm-labs/design/types`.
- `npm run design:export` also writes the firmware header `firmware/core/src/generated/faces.h`; never hand-copy glyphs.

## Rules

- A face is two eye glyphs and an optional mouth, drawn in Geist Mono 800, identity colour on true black.
- Orange `#FF5A1F` means only "it needs you" (the `ask` face and the decision layout).
- Flat: no glow, no gradients. Motion (blink, glance, pop, typed line, cursor) timings live in `packages/design/tokens.json`.
- Alive (spec 005): breathing, double and slow blinks, pondering while thinking, `squish()` on key down, `setVoiceLevel()` while listening, eyes on the finger. Change motion in `charm-face.js` and `firmware/core/src/ui/lvgl_view.cpp` together; behaviour (reactions, sleep, greeting) lives in `firmware/core/src/app.cpp`.
- Layouts: face, speech, decision.

## Adding a mood

1. Add it to `FACES` and `ORDER` in `charm-face.js` (fields are documented in `faces.json` → `fields`).
2. `npm run design:export`, then `npm test` (data tests check ids, states → faces, hex colours, effects).
3. Update the moods table in `OPENCHARM.md` ("The face").

## Mapping a state to a face

Edit `STATES` in `charm-face.js`: `id`, `face` (an existing face id), `name`, `when`, `trigger`. Regenerate, test, update `OPENCHARM.md` ("Agent states → faces").
