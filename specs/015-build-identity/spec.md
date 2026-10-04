# 015: Build identity

Status: In progress
Depends on: 001, 002, 004, 006, 008, 013

## Why

When something goes wrong, we need to know exactly what was running: which CLI and charmd, which desktop app, which emulator or charm firmware, which website, which starter a workspace came from. Today only the CLI and the desktop app know their release version; the website, the emulator and the charm can't say what build they are, and the bug form asks only for the OS and Node. The maintainer wants every part that can run to say what it is, for bug reports and as a reference of what was live (3–4 October 2026).

## Scope

- **One identity format everywhere, the tag's own:** `<unit>@<version> (<commit>)`, for example `cli@0.2.0 (abc1234)`, `desktop@0.2.0 (abc1234)`, `web@0.3.1 (abc1234)`: the release version from the unit's tag, and the short commit it was built from. A build from source says `cli@0.0.0 (abc1234)`; one with uncommitted changes adds `-dirty`.
- **Versions for what we release**, all from tags (CONTRIBUTING "Releasing", `tools/release`):
  - the CLI (`cli@x.y.z`, npm) and the desktop app (`desktop@x.y.z`), as today
  - the website, a new unit: `web@x.y.z`, released by a merged `fix`/`feat`/`perf` touching `apps/web` or `packages/design`; a tag and a GitHub release with notes, no publish step (Vercel deploys every merge)
- **Each build carries its identity** (version and commit stamped at build time):
  - CLI and charmd: `opencharm --version`; charmd logs it at start and reports it in `status`
  - desktop app: shown in Settings ("About")
  - emulator: the identity of the CLI or desktop app that ships it, in its side panel (settings), never on the charm's screen
  - website: a small label in the footer and `/version.json` (`{ "version", "commit" }`); a deploy that isn't a release says `web@0.3.1+2 (abc1234)`: two commits after `web@0.3.1`
  - firmware core: `charm::kBuild`, compiled in (the emulator today; the board with spec 009)
- **The charm says what it runs:** the charm's `hello` gets an optional `build: { kind, version, commit }`, with `kind` one of `emulator`, `desktop`, `board` (packages/protocol, fixtures for both sides; the protocol version stays 1). charmd logs it on connect and lists it per charm in `opencharm status`.
- **The starter:** `opencharm init` records the starter commit it cloned in `opencharm.json` (`"starter": { "commit": "…" }`), so a workspace says which template it began from.
- **Bug reports:** the bug form asks for `opencharm status` output (every identity in one go) and, for the website, its footer label.

## Decisions

- Versions live only in tags; the code says `0.0.0` and CI stamps the real one (maintainer, 3 October 2026).
- The website gets a version too, as a reference of what was live when (maintainer, 4 October 2026).
- The emulator isn't a release unit of its own: it's never installed alone, so it carries the version of the app that ships it, plus its own commit.
- The identity is never on the charm's screen, only in settings (the emulator's side panel, the desktop app's Settings, the board's settings with spec 009) (maintainer, 4 October 2026).
- No redeploy after a web release: Vercel deploys each merge before CI tags it, so that deploy shows the previous version plus its commit (`web@0.3.0+1 (abc1234)`) until the next deploy; the commit is always exact (maintainer, 4 October 2026).

## Not in scope

- A release unit for the board firmware (`firmware@x.y.z`) and its settings: with spec 009, which builds the board port. This spec puts `kBuild` in the firmware core and the field in `hello`, so 009 only fills them in.
- Crash reporting or telemetry: nothing is sent anywhere; identities appear only where the person looks (their terminal, Settings, the page).

## Acceptance

- [ ] `opencharm --version` prints `<version> (<commit>)`; a release build prints its tag's version (`cli-release.yml` stamps both; a test on the version string).
- [ ] `opencharm status` lists charmd's identity and each connected charm's `build` (charmd test with the fake charm).
- [ ] The emulator and the desktop charm send `build` in `hello`; charmd logs it (protocol fixtures read by the TypeScript and C++ tests; firmware core test for `kBuild`).
- [ ] The desktop app's Settings show its identity (desktop test).
- [ ] `web@x.y.z` is released by the release flow like the other units (`tools/release` tests), and the site's footer and `/version.json` show the identity (website e2e test).
- [ ] `opencharm init` writes `starter.commit` (init test).
- [ ] The bug form asks for `opencharm status`; CONTRIBUTING "Releasing" and `OPENCHARM.md` describe the identities.
