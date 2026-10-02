# hardware — enclosure and board reference

Licence: CERN-OHL-S-2.0 (see the root README). Skill: `opencharm-hardware`. Boards and the enclosure: `README.md`.

- `cad/gen.py` is the only source of the shell geometry; `stl/print` and `stl/view` are generated (`npm run cad:build`).
- `prototype/PROTOTYPE.html` is generated from `prototype/prototype-template.html` and `stl/view` (`npm run prototype:build`); `prototype/vendor/` is three.js, unmodified.
- `reference/` is Waveshare's drawing (Apache-2.0), unmodified; dimensions are summarised in its `NOTICE.md`.
- Every dimension change: update "Enclosure v0.1" in `README.md` and regenerate both outputs in the same change.
