# AGENTS.md — OpenCharm

OpenCharm is an open-source body (face, voice, one key) for an AI agent the user already runs: Hermes Agent, OpenClaw, Claude Code or anything OpenAI-compatible. One agent at a time. This file is for every coding agent; keep it short and move detail into skills.

Read in this order, only as far as the task needs:

1. `OPENCHARM.md`: what the product is (the source of truth). When code and spec disagree, flag it; never drift silently.
2. `specs/README.md`: how work is specified and shipped. The spec you are working on is in `specs/NNN-<slug>/`.
3. The skill for the area you touch (`.agents/skills/`, also visible to Claude Code as `.claude/skills/`).
4. `DESIGN.md` for any UI, page or image: the visual identity (tokens and rules), checked against `packages/design/tokens.json`.

## Map

| Path                | What                                                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`          | `@opencharm-labs/web`: opencharm.dev, Next.js 16 on Vercel; static landing page, spec 008                                                                                               |
| `apps/desktop`      | `@opencharm-labs/desktop`: the desktop charm (spec 013), Tauri 2 around the emulator's firmware core: the Mac notch, a global talk key, settings; releases from CI                      |
| `packages/charmd`   | `@opencharm-labs/charmd`: charmd, the charm daemon (config, auth, store, device sessions, admin socket); bundled into the CLI as `opencharm serve`                                      |
| `packages/cli`      | `opencharm`: the published CLI (bundled with tsdown to `dist/main.mjs`); `opencharm init` clones github.com/opencharm-labs/opencharm-starter                                            |
| `packages/protocol` | `@opencharm-labs/protocol`: charm ↔ charmd messages (zod schemas, parser) and the JSON contract fixtures the C++ core also reads                                                        |
| `packages/design`   | `@opencharm-labs/design`: faces, colours, states, tokens, the face engine (`src/charm-face.js` is the source of truth)                                                                  |
| `tools/checks`      | `@opencharm-labs/checks`: repo-invariant tests and `spec:new`                                                                                                                           |
| `firmware`          | OpenCharm OS: `core/` (portable C++, LVGL UI, state machine, protocol; spec 005), `sim/` (the emulator: core in WebAssembly, spec 006), `device/` (XiaoZhi fork, spec 009, not started) |
| `hardware`          | enclosure CAD (`cad/gen.py`), STLs, Waveshare reference, `prototype/` (3D page)                                                                                                         |
| `brand`             | app icon set and its builder                                                                                                                                                            |
| `specs`             | numbered feature specs and plans                                                                                                                                                        |
| `docs`              | guides for people (`build.md`, `deploy.md`)                                                                                                                                             |

## Commands

```bash
npm ci                    # install (Node 24)
npm run check             # green checkpoint: format:check, lint, typecheck, test, py:check
npm run format            # Prettier (a Claude hook also formats each edited file)
npm test                  # all workspaces, including repo-invariant checks
npm run cli -- faces      # run the CLI from source
npm run cli -- serve      # run charmd from source (then: npm run cli -- pair <code>)
npm run dev               # the website on http://localhost:3000
npm run design:export     # after editing packages/design/src/charm-face.js
npm run prototype:build   # after changing hardware/stl or the prototype template
npm run cad:build         # after editing hardware/cad/gen.py (Python deps: see CONTRIBUTING)
npm run icon:build        # after editing brand/build_icon.py (Python deps: see CONTRIBUTING)
npm run spec:new <slug>   # scaffold the next numbered spec
npm run firmware:test     # C++ core: configure, build, run tests (needs cmake, ninja)
npm run firmware:fonts    # regenerate LVGL fonts after changing faces or sizes
npm run firmware:format   # clang-format the C++ (CI checks it)
npm run firmware:sim      # build the emulator (Emscripten) into packages/cli/sim
npm run sim               # open the emulator (charmd must be running: npm run cli -- serve)
npm run desktop           # the desktop charm (needs Rust and npm run firmware:sim first)
npm run test:e2e -w packages/cli   # emulator end to end in headless Chrome
npm run test:e2e -w @opencharm-labs/web   # the built website in Chrome (after npm run build -w @opencharm-labs/web)
```

Generated files (never edit by hand): `packages/design/faces.json`, `firmware/core/src/generated/faces.h`, `firmware/core/src/ui/fonts/*.c`, `hardware/prototype/PROTOTYPE.html`, `hardware/stl/**`, `brand/icon/**` and its copies in `apps/web` (`src/app/icon.svg`, `apple-icon.png`, `favicon.ico`, `public/icon-512.png`).

## Decisions that bind

- One agent at a time; the charm is a thin body: no API keys, no models, no PIN on the device.
- charmd (the charm daemon) is thin: door (protocol, audio), guard (pairing, PIN, lock, permissions), voice plumbing. Behaviour belongs to the agent.
- Controls: hold key = talk / yes on orange; press = wake, stop, dismiss, no; tap face = react. No required swipes. The mic opens only while the key is held.
- Face: glyph faces (two eyes + optional mouth), Geist Mono 800, identity colour on true black. Layouts: face, speech, decision. Orange `#FF5A1F` on screen only means "it needs you". Flat, no glow.
- Hardware reference: Waveshare ESP32-S3-Touch-AMOLED-2.16 (battery version). White is the default charm; users print the shell in any colour. Keychain strap leaves from the seam, no through-hole.
- Everything is proven on localhost (emulator + charmd + any agent, including Claude Code) before the real device.
- KISS, and as secure as possible while simple. No secrets in the repo, ever.
- We sell and ship nothing: no waitlist, no kits; people build their own. No warranty (README). Never use "Muse" in names, handles, paths or visuals.

## Code conventions

Details and examples: skill `opencharm-conventions`.

- TypeScript strict (`noUncheckedIndexedAccess`), ES modules, kebab-case files, named exports (default only where Next.js requires it), no barrel files.
- File order: imports → types → constants → private helpers → exported functions last. Comments explain why, never what.
- zod at every boundary (config, network, files). Tests co-located as `*.test.ts` (Vitest), `it` strings read as behaviour.
- Python (CAD, icon): ruff. C++ (firmware, from spec 005): clang-format, doctest.
- Tool versions: TypeScript 6.0 and ESLint 9 until typescript-eslint and eslint-config-next support newer majors.

## Working rules for agents

- A new feature starts from a numbered spec (no spec, no feature code): propose one with `npm run spec:new`. A change to an existing feature updates that feature's spec in place (one living spec per feature). Fixes, refactors, performance, docs, CI, guards and cleanups are not specs: they go on a `fix/`, `perf/`, `docs/`, `chore/` or `ci/` branch with the docs they touch ([specs/README.md](specs/README.md), "What gets a spec").
- Stay inside the spec's scope; note anything else in the PR under "Follow-ups".
- Docs are part of the change: update `OPENCHARM.md` and any doc the change makes wrong in the same PR.
- Run `npm run check` before saying you are done, and quote its result.
- Mark estimates and anything unverified as such; never state prices or specs without a source.
- Save tokens: read the files the task needs, use skills instead of re-reading the codebase, don't paste large generated files.
- Ask the maintainer when the spec is ambiguous; don't guess on product decisions.

## Git

- Trunk-based: `main` is the only long-lived branch and is always green. Every change starts on a short branch from an up-to-date `main` (`spec/NNN-<slug>`, `fix/…`, `perf/…`, `docs/…`, `chore/…`, `ci/…`), one topic per branch, or a worktree. Conventional commits (`feat(cli): …`, `fix(design): …`).
- A change reaches `main` only through a pull request whose checks pass. When `npm run check` is green, push the branch and open the PR against `main` (`gh pr create`), filling in the PR template. The maintainer reviews and merges it with a merge commit; GitHub then deletes the branch. Agents never merge their own PR.
- Behind `main`? Merge `main` into your branch (no rebase of pushed work). Never push to `main`, never force-push, never commit secrets or `.env` files.
- Never credit an AI tool as an author: no `Co-Authored-By` trailers for coding agents, no "Generated with …" lines, in commits, PRs, issues or docs.
- Guards check every commit (Git hooks from `npm install`) and every committable file (`npm test`): no keys or tokens, no home-folder paths, no AI attribution, nothing over 1 MB (CONTRIBUTING "Guards"). Fix the cause; never weaken a guard, never `--no-verify`, never change `core.hooksPath`.
