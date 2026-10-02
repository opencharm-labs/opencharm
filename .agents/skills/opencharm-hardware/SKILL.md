---
name: opencharm-hardware
description: Use when changing the printed enclosure, the STL files, the 3D prototype page or board reference data in hardware/, or when a measurement from the real board arrives.
---

# OpenCharm hardware

## Pipeline

1. Edit parameters at the top of `hardware/cad/gen.py` (manifold3d + trimesh; setup in `CONTRIBUTING.md`).
2. `npm run cad:build` → `hardware/stl/print/*.stl` (print orientation) and `hardware/stl/view/*.stl` (assembly coordinates).
3. `npm run prototype:build` → `hardware/prototype/PROTOTYPE.html` (embeds `stl/view`). `npm test` fails if you forget.
4. Open `hardware/prototype/PROTOTYPE.html` from disk and check the part in 3D.
5. Update `hardware/README.md` "Enclosure v0.1" (dimensions table, features, checks before the first print); touch `OPENCHARM.md` only if the summary there changes.

## Rules

- The outline is the glass outline offset outward with concentric corners; keep the frame equal width everywhere.
- The battery never carries load: cradle, 0.5–1 mm swelling room, strap pin and its pull clear of the battery, battery away from the ESP32-S3 antenna end.
- `hardware/reference/` is Waveshare's drawing (Apache-2.0): never modify; read numbers from `hardware/reference/waveshare-esp32-s3-touch-amoled-2.16/NOTICE.md`.
- Mark every dimension not measured on a real board as unverified in `hardware/README.md`.
- Licence of this folder: CERN-OHL-S-2.0.
