# Contributing to OpenCharm

Thanks for helping. OpenCharm is built spec by spec, by people and by coding agents, with the same rules for both.

## Setup

- Node 24 (`.nvmrc`), then `npm ci`.
- ruff 0.16 for the Python scripts (CI pins `ruff==0.16.*`): `pipx install "ruff==0.16.*"` (pinned version) or `brew install ruff` (latest, may differ from CI).
- Optional, for the enclosure and icon builders: a virtual environment with their dependencies.

  ```bash
  python3 -m venv .venv
  .venv/bin/pip install cairosvg pillow -r hardware/cad/requirements.txt
  source .venv/bin/activate    # so npm run cad:build / icon:build use it
  ```

  The icon builder needs the Cairo library (`brew install cairo` on macOS; on Apple silicon also `export DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib`, then run `python brand/build_icon.py` directly, because macOS strips that variable from `npm run`).

- Firmware core (optional): `brew install cmake ninja clang-format` (or your OS equivalents), then `npm run firmware:test`.
- Emulator (optional): Emscripten (`brew install emscripten`, or the official emsdk) and Google Chrome for its end-to-end test; `npm run firmware:sim`, then `npm run sim`.
- Windows: enable symlinks before cloning (`git config --global core.symlinks true`, Developer Mode on) so `.claude/skills` works.

## How work happens

1. A new feature starts from a numbered spec in `specs/`. Fixes, refactors, performance work, docs, CI and cleanups don't get a spec: they go on a `fix/`, `perf/`, `docs/`, `chore/` or `ci/` branch with the docs they touch updated in the same change ([what gets a spec](specs/README.md#what-gets-a-spec)).
2. Branch `spec/NNN-<slug>`, one spec per branch, conventional commits.
3. `npm run check` must pass locally and in CI.
4. The change updates `OPENCHARM.md` (what the product is), the README next to the code it changes, and any other doc it makes wrong.
5. Every change reaches `main` through a pull request: contributors from a fork, the maintainer and coding agents from a branch in this repository (`main` is the only long-lived branch; nobody pushes to it).
6. The maintainer reviews it and merges it with a merge commit once the checks pass; the branch is then deleted. If `main` moved on meanwhile, merge `main` into the branch (no force-push).

Coding agents (Claude Code, Codex, OpenClaw workers, Hermes) read [AGENTS.md](AGENTS.md) and the skills in `.agents/skills/`. Issues created with the "Spec task" form are ready for an agent to pick up.

## Testing and definition of done

How each part is tested:

- **charmd, automatic** (Vitest): token and PIN hashing, lock and wrong-try logic, protocol parsing, Ogg wrap/unwrap round-trip on sample files, sentence splitting; a **full turn with no network and no keys** (a Node fake charm replaying recorded Opus, the `fake` agent, a fake voice provider); security cases (5 wrong PINs → blocked, revoked token rejected, audio before unlock ignored, oversized frame → disconnect).
- **firmware/core, automatic**: state machine and protocol handling tested natively (host build) with a fake HAL; UI snapshots.
- **Emulator**: a headless end-to-end test in CI (`emulator.yml`: pair, PIN, hold, spoken answer, with a fake mic), plus a checklist and the real-microphone run by hand.
- **Real services, by hand**: one smoke test with real OpenAI voice and Hermes on the droplet.
- **Device**: builds for the 2.16; the same checklist on the board when it arrives.

The MVP is done when all of this works, in the emulator first, then on the Waveshare 2.16:

1. Fresh charm: Wi-Fi setup (device only) → pairing → PIN → unlocked.
2. Hold, ask, hear Hermes answer from the droplet; faces listening → thinking → speaking → idle.
3. Power-cycle → locked, PIN unlocks; 5 wrong → blocked, `unlock` restores; `lock` takes effect within 2 s; `revoke` → back to pairing.
4. Works on a phone hotspot (device).
5. Logged in as the Hermes user, charmd's state and config can't be read.
6. No audio on disk; "key released → first audio" measured and written into `packages/charmd/README.md` (target about 1.5 s).
7. Docs updated: README, `OPENCHARM.md`, `firmware/README.md`, `docs/build.md`.

## Releasing the CLI (maintainer)

`.github/workflows/cli-release.yml` publishes `opencharm` to npm with provenance when `packages/cli/package.json`'s version isn't on npm yet. It builds the emulator and the CLI and runs the CLI's tests first.

1. Once: on npmjs.com, add this workflow as a trusted publisher for `opencharm`. For the very first publish, before the package exists, add an `NPM_TOKEN` repository secret instead and delete it afterwards.
2. To release: bump `version` in `packages/cli/package.json`, merge to `main`, then run the workflow on `main` (Actions → CLI release → Run workflow).

The desktop app is released the same way (see `apps/desktop/README.md`).

Both release workflows are manual only while the repository is private. At launch they go back to releasing on their own when the version changes on `main`: add `push: branches: [main]` under `on:` in each (their version checks already skip anything released).

## Guards

Every change passes the same guards, whoever writes it (a person or a coding agent). They run twice:

- **On every commit.** The Git hooks in `.githooks/` are switched on by `npm install` (`core.hooksPath`). `pre-commit` checks what is staged and `commit-msg` checks the message, so nothing bad ever becomes a commit.
- **In `npm test`.** `tools/checks/src/guards-repo.test.ts` runs locally and in CI on every file Git would commit, so a skipped hook is still caught.

Claude Code is denied `--no-verify`, changing `core.hooksPath`, and editing `.githooks/` (`.claude/settings.json`). Other agents get the same rule from AGENTS.md.

The guards:

- no keys or tokens (private keys and the usual API and token formats)
- no home folder of the computer running the check
- no AI tool credited as an author
- no file over 1 MB, except a short list kept on purpose

CI also runs `npm audit --omit=dev --audit-level=high` on every change and weekly (`.github/workflows/audit.yml`).

If a guard trips:

- **A key:** remove it. If it was ever pushed, revoke it with its provider; deleting it from Git isn't enough.
- **A path or an attribution line:** fix the file, or the generator that wrote it.

## Repository settings (maintainer)

In the GitHub settings of `opencharm-labs/opencharm` and `opencharm-labs/opencharm-starter`:

- Pull requests: merge commits only (each branch's conventional commits stay in the history), and "Automatically delete head branches" on.
- Features: Projects off; in the starter, issues off (reports go to this repo) and "Template repository" on.
- Code security: Dependabot alerts; secret scanning with push protection (blocks a push that contains a key); private vulnerability reporting (`SECURITY.md` points people to it).
- Actions: the workflow token stays read-only by default; each workflow asks for what it needs.
- A ruleset for `main`: no deletion, no force-push, pull requests only, and the checks must pass.

On the free plan, secret scanning, private vulnerability reporting and rulesets only work on public repositories: turn them on the day the repositories go public, together with the release triggers (see "Releasing the CLI").

`.github/dependabot.yml` opens a monthly pull request against `main` when a GitHub Action has a new version.

## Licence of contributions

Contributions are accepted under the licence of the folder they change (see the table in [README.md](README.md#licences)).
