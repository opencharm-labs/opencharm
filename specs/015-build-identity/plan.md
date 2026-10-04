# 015 plan: Build identity

Branch `spec/015-build-identity`. Test first in every task; `npm run check` green after each.

Identity string everywhere: `<unit>@<version> (<commit>)`. CLI and desktop: version from their `package.json` (CI stamps the release version; `0.0.0` from source), commit from `git rev-parse --short HEAD` at build time (`-dirty` if the tree has changes, `unknown` without git). Website: `git describe --tags --match 'web@*'`, so a deploy after `web@0.3.1` reads `web@0.3.1+2 (abc1234)`.

## Tasks

1. **Protocol** (`packages/protocol`): `clientHello` gains optional `build: { kind: "emulator" | "desktop" | "board", version: string ≤ 64, commit: string ≤ 40 }` (strict). New fixture `valid/client-hello-with-build.json`; an invalid one with an unknown `kind`. Tests: schema accepts both hellos, rejects the bad kind.
2. **Firmware core** (`firmware/core`): `struct Build { std::string kind, version, commit; }` in `protocol.h`; `client_hello(const Build& = {})` adds `build` only when `kind` is set; `AppOptions::build`; `App::on_connected` sends it. CMake stamps `CHARM_COMMIT` (`git rev-parse`, `-dirty`, `unknown`) into `charm::kBuildCommit`. Tests: `client_hello()` still equals `client-hello.json`; with a build, equals `client-hello-with-build.json`.
3. **Emulator** (`firmware/sim`): new export `sim_set_build(kind, version)`, called by `sim.js` before connecting; the commit is the core's `kBuildCommit`. `sim.js` reads its host's identity from `config.json` (`opencharm sim`) or `charmParams` (`version=`, the desktop app) and shows `<version> (<commit>)` in the side panel (`#build`, under `#url`), never on the charm's screen. Emulator e2e: the side panel shows it; charmd receives `build`.
4. **CLI and charmd**: `packages/cli/src/identity.ts` (`identity()` → `cli@<version> (<commit>)`, commit injected by tsdown `define` from `git rev-parse` at build, `"dev"` under tsx). `opencharm --version` prints it; `serve` passes it to charmd, which logs it at start; `status` returns `charmd` and, per charm, the `build` from its `hello` (`device/session.ts` keeps it); `printStatus` shows both. The sim server's `config.json` adds `version`. Tests: version string; status with the fake charm sending `build`.
5. **Desktop app**: `build.rs` sets `OPENCHARM_COMMIT`; Tauri command `app_identity` → `desktop@<version> (<commit>)`; Settings footer shows it; `desktop.js` passes `version=desktop@…` to the emulator. Tests: Rust unit test for the string; `app.test.ts` wiring.
6. **Website**: `apps/web/scripts/identity.ts`, run before `next build`: `git describe` (fetches tags if the clone has none), writes `public/version.json` and `src/app/_lib/build.json` (both gitignored); the title block shows the revision. e2e: `/version.json` and the label.
7. **Release units**: `tools/release` gains `web` (`apps/web`, `packages/design`); `web-release.yml` (after a green CI, like the others): plan, then tag `web@x.y.z` and create the GitHub release; no publish. Tests: `UNITS.web`; actionlint.
8. **Starter**: `init` writes `starter.commit` (the cloned HEAD) into `opencharm.json`; charmd's config schema accepts `starter: { commit }` (strict). Test: init writes it; config parses it.
9. **Docs**: bug form asks for `opencharm status` (and the site's revision); CONTRIBUTING "Releasing" (web unit, identities); `OPENCHARM.md`; READMEs of cli, charmd, desktop, web, firmware; spec 015 Done and the index row; delete this plan.

## Order and checks

1 → 2 → 3 (protocol before both sides), then 4, 5, 6, 7, 8, 9. After all: `npm run check`, `npm run firmware:test`, `npm run firmware:sim` + emulator e2e, website build + e2e, Rust tests; adversarial review rounds; PR `feat: …`.
