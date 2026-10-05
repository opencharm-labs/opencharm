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
3. `npm run check` must pass locally and in CI, and the branch gets an independent, adversarial review before its pull request (AGENTS.md, "Working rules for agents"): findings are reproduced, then fixed or rejected with a reason in the pull request's Evidence. CI is one workflow, `.github/workflows/ci.yml`: the same checks on every change, plus the firmware, emulator, website and desktop jobs only when their files change (the desktop app on macOS and Windows too). Its `ci` job is the single result to look at.
4. The change updates `OPENCHARM.md` (what the product is), the README next to the code it changes, and any other doc it makes wrong.
5. Every change reaches `main` through a pull request: contributors from a fork, the maintainer and coding agents from a branch in this repository (`main` is the only long-lived branch; nobody pushes to it).
6. Its title is a conventional commit (`fix(cli): …`): the maintainer reviews it and squash-merges it once the checks pass, so each pull request becomes one commit on `main`, and the branch is then deleted. If `main` moved on meanwhile, merge `main` into the branch (no force-push).

Coding agents (Claude Code, Codex, OpenClaw workers, Hermes) read [AGENTS.md](AGENTS.md) and the skills in `.agents/skills/`. Issues created with the "Spec task" form are ready for an agent to pick up.

## Testing and definition of done

How each part is tested:

- **charmd, automatic** (Vitest): token and PIN hashing, lock and wrong-try logic, protocol parsing, Ogg wrap/unwrap round-trip on sample files, sentence splitting; a **full turn with no network and no keys** (a Node fake charm replaying recorded Opus, the `fake` agent, a fake voice provider); security cases (5 wrong PINs → blocked, revoked token rejected, audio before unlock ignored, oversized frame → disconnect).
- **firmware/core, automatic**: state machine and protocol handling tested natively (host build) with a fake HAL; UI snapshots.
- **Emulator**: a headless end-to-end test in CI (`ci.yml`, job `emulator`: pair, PIN, hold, spoken answer, with a fake mic), plus a checklist and the real-microphone run by hand.
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

## Releasing

`main` is production. The website deploys on every merge (Vercel), `opencharm init` clones the starter's `main`, and the CLI and the desktop app release themselves: there is no release branch, release pull request or version bump to make by hand.

**How a merge becomes a release.** After every push to `main` whose CI passed, `cli-release.yml` and `desktop-release.yml` each ask `tools/release` whether their unit has something new: the conventional-commit titles merged since its last tag, counting only the folders it ships.

| Unit        | Tag             | Counts changes in                                                                                                                                                                                                            | Publishes                                                                                                                                              |
| ----------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CLI         | `cli@x.y.z`     | `packages/cli`, `charmd`, `protocol`, `design`, `firmware/core`, `firmware/sim` (it bundles them; its npm dependencies are installed from their ranges, so the lockfile never ships)                                         | `opencharm` on npm, with provenance                                                                                                                    |
| Desktop app | `desktop@x.y.z` | `apps/desktop`, `firmware/core`, `firmware/sim`, `brand/icon`, `packages/design` (its pages include the face engine), and the charmd it carries: `packages/cli`, `packages/charmd`, `packages/protocol`, `package-lock.json` | installers for macOS (Apple silicon, Intel) and Windows on GitHub Releases, with `SHA256SUMS.txt` and build attestations; a pre-release while unsigned |
| Website     | `web@x.y.z`     | `apps/web`, `packages/design` (the face engine it shows)                                                                                                                                                                     | nothing to publish (Vercel deploys every merge); the tag and the GitHub release record what went live                                                  |

| PR title                                                                                        | Release                         |
| ----------------------------------------------------------------------------------------------- | ------------------------------- |
| `fix: …`, `perf: …`, or a revert (`revert: …`, GitHub's `Revert "…"`) of a change that released | patch: 0.1.0 → 0.1.1            |
| `feat: …`                                                                                       | minor: 0.1.1 → 0.2.0            |
| `feat!: …` or `fix!: …` (the `!` in the title; a footer in a branch commit doesn't count)       | minor below 1.0, major from 1.0 |
| `docs:`, `ci:`, `chore:`, `test:`, `refactor:`, `build:`, `style:`                              | none                            |

If there is something, the workflow stamps the version into the build, builds and tests, publishes, then tags and creates the GitHub release, whose notes list the PR titles by section. The CLI is tagged once the package is on npm; the desktop app builds into a draft release that's published (and tagged) only when every installer is attached. So a tag always means a complete release.

**Versions live in tags only.** The repository's `package.json` files (and the desktop app's `Cargo.toml`) say `0.0.0`, so the code never states a version that could drift; CI stamps the real one into what it builds. From source, `opencharm --version` says `0.0.0`, and the desktop app offers no updates. The GitHub Releases page is the changelog.

**Every build says what it is** (spec 015), as `unit@version (commit)`, the tag's own form: `opencharm --version` and `opencharm status` (charmd, each connected charm's build from its hello, the starter commit the workspace began from); the desktop app at the bottom of Settings; the emulator in its side panel; the website in its title block (REV) and `/version.json`, which reads `web@0.3.1+2 (abc1234)` for a deploy two commits after `web@0.3.1`. A build from source says `0.0.0` (`-dirty` with uncommitted changes). The bug form asks for `opencharm status`.

**Commands.** `npm run release:next -- cli` (or `desktop`) prints what `main` would release now. If a release fails, re-run it (Actions → CLI release or Desktop release → Re-run, or Run workflow on `main`; other branches can't release, and a run started by hand needs a green CI on that commit). The CLI skips what's done (a version already on npm from this commit, an existing tag); a version already on npm from an earlier commit that was never tagged is repaired (the run tags that commit, then starts a fresh release for what came after); from a commit outside `main`'s history, the run stops with the command to tag it by hand. The desktop app does nothing if the version is already released, and otherwise starts from a fresh draft (removing earlier drafts this workflow made; a draft written by hand is left alone). If `main` had moved on by the time a commit's CI finished, its release run stands down with a warning and the newer commit's release covers it (if several merges queue up, GitHub keeps only the newest waiting CI run, whose release covers the others); should the newer commit's CI fail, run the workflow by hand on `main` once it's green. A breaking change only releases in a releasing type (`feat!`, `fix!`); `docs!` or `ci!` release nothing. To leave something out of a release, don't merge it yet.

**Security of the release jobs.** The jobs that install and run third-party code (`npm ci`, Emscripten, the tests, the CLI and desktop builds) have a read-only token, no npm publishing right and no token on disk. Only two short jobs can write: the CLI's `publish` (npm through OIDC, the tag) and the desktop app's `publish` (checksums, attestations, the release); neither runs an installed package. The release planner runs on plain Node, with nothing installed. A release run also stands down if `main` had moved on by the time its commit's CI finished, so provenance always names the commit that was built; the newer commit's release covers it.

**npm.** `opencharm` trusts only `cli-release.yml` (trusted publishing, with "Allow npm publish" on) and its publishing access is "Require two-factor authentication and disallow tokens": there is no npm token anywhere. The name was claimed on 3 October 2026 with an empty `0.0.0` published by hand (trusted publishing needs the package to exist); `0.1.0` (3 October 2026) is the first release with code.

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

CI also runs `npm audit --omit=dev --audit-level=high` on every change and weekly (`ci.yml`), failing a pull request that changes dependencies (so none can bring one in) and the weekly run (so a new advisory shows); otherwise it warns, because an advisory nobody can fix yet mustn't block every other change, nor a push to `main`, whose success is what releases. Dependabot alerts track them too.

If a guard trips:

- **A key:** remove it. If it was ever pushed, revoke it with its provider; deleting it from Git isn't enough.
- **A path or an attribution line:** fix the file, or the generator that wrote it.

## Repository settings (maintainer)

In the GitHub settings of `opencharm-labs/opencharm` and `opencharm-labs/opencharm-starter`:

- Pull requests: squash merging only (merge commits and rebase off), with "Pull request title and commit details" as the default message, so `main` gets one conventional commit per pull request; "Always suggest updating pull request branches" and "Automatically delete head branches" on.
- Features: Projects off; in the starter, issues off (reports go to this repo) and "Template repository" on.
- Code security: Dependabot alerts; secret scanning with push protection (blocks a push that contains a key); private vulnerability reporting (`SECURITY.md` points people to it).
- Actions: the workflow token stays read-only by default; each workflow asks for what it needs.
- Branch protection on `main`: pull requests only, with 1 approval; the `ci` check (`test` in the starter) must pass on an up-to-date branch; no force-push, no deletion. While there is one maintainer, they merge their own pull requests with the admin bypass, only once `ci` is green.

`.github/dependabot.yml` opens a monthly pull request against `main` when a GitHub Action has a new version.

## Licence of contributions

Contributions are accepted under the licence of the folder they change (see the table in [README.md](README.md#licences)).
