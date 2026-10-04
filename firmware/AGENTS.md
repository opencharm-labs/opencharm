# firmware — OpenCharm OS

`core/` (spec 005) and `sim/` (spec 006) are built; `device/` (spec 009) is not started. Read `firmware/README.md` (the detail) and `OPENCHARM.md` ("OpenCharm OS and the emulator") first; skill `opencharm-firmware`.

- `core/`: portable C++17, no ESP-IDF includes, single-threaded and non-blocking, talks only to the HAL.
- `device/`: hard fork of 78/xiaozhi-esp32 (MIT, keep its licence and credit), ESP-IDF 6.0; implements the HAL.
- `sim/`: the same core compiled to WebAssembly (Emscripten); the browser implements the HAL. Skill `opencharm-emulator`.
- Faces, colours and states come from `packages/design/faces.json` via a generated header; never hand-copy them.
- The mic is on only while the key is down, and nothing leaves the charm unless it's a hold; this rule lives in firmware, not in charmd.
