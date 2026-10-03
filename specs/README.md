# specs/

One folder per **feature**, numbered in build order. `OPENCHARM.md` at the root says what the product **is**; a numbered spec says what one feature **adds** and why.

## What gets a spec

A spec is for a feature: something a person using OpenCharm (or a developer building on it) can do afterwards that they couldn't before, or a change to how an existing feature behaves for them. Examples: a protocol message, a charmd capability, a screen or face behaviour, a CLI command, the desktop app, a page of the website.

Not a spec (it goes straight to a branch, with the docs it touches updated in the same change):

- bug fixes, refactors, performance work and tests
- docs, README and `OPENCHARM.md` edits, cleanups
- CI, release workflows, guards and checks, tooling, dependency updates
- research and spikes: record what was learnt in the README of the area it concerns, then write a spec if a feature follows

Branches for that work: `fix/…`, `perf/…`, `docs/…`, `chore/…`, `ci/…`. If unsure, ask: "does this change what someone can do with OpenCharm?" If not, it isn't a spec.

## Workflow

1. `npm run spec:new <slug>` creates `specs/NNN-<slug>/spec.md` from `_template/`.
2. Write the spec: why, scope, not in scope, acceptance. One page. Status `Draft`.
3. The maintainer approves it: status `Approved`.
4. Just before building, write `plan.md` next to it (tasks with files and steps). Status `In progress`.
5. Build on branch `spec/NNN-<slug>` from `main`. Once `npm run check` is green, open a pull request against `main` titled as a conventional commit; the maintainer squash-merges it. Link the spec (and the GitHub issue, if any).
6. The same change updates `OPENCHARM.md`, the README next to the code and any docs it touches, and sets status `Done`. Delete `plan.md`: plans are derived from the spec and only live while it's being built (git keeps them).

Everything is built and proven on localhost first (charmd, emulator, any agent including Claude Code), then on the droplet; the real device (009) comes last and only swaps the HAL.

## One living spec per feature

A spec describes its feature **as it is now**. When the feature changes later (an improvement, a new option, a behaviour change), update its spec in place instead of writing a new one:

- Proposed changes wait in the spec's `Next` section.
- Once the maintainer approves them, they move into Scope and Acceptance, the status goes back to `Approved`, and the steps above run again.
- Decisions keep who decided and when; git keeps the old versions.

A new spec is only for a new feature. If a change could be described as "the desktop charm now also …", it belongs to that feature's spec.

## Numbers

- A number is the feature's identifier, never reused or renumbered, so "spec 011" always means the same feature.
- A feature that is abandoned keeps its folder with status `Dropped`.
- If a document that isn't a feature is ever removed, its number is retired: listed here as "Retired numbers: …", and skipped by `spec:new`.
- The numbers were set once, on 2 October 2026, before the repository went public, when earlier documents were merged into one spec per feature.

## Index

| #   | Spec                                                                  | Status      |
| --- | --------------------------------------------------------------------- | ----------- |
| 001 | [Protocol package](001-protocol/spec.md)                              | Done        |
| 002 | [charmd core (sessions, pairing, PIN, lock)](002-charmd-core/spec.md) | Done        |
| 003 | [Voice and agent turns](003-voice-turns/spec.md)                      | Done        |
| 004 | [Workspace](004-workspace/spec.md)                                    | Done        |
| 005 | [OpenCharm OS (firmware core)](005-opencharm-os/spec.md)              | Done        |
| 006 | [Emulator](006-emulator/spec.md)                                      | Done        |
| 007 | [Droplet deploy](007-droplet-deploy/spec.md)                          | In progress |
| 008 | [Website (opencharm.dev)](008-website/spec.md)                        | In progress |
| 009 | [Firmware device (Waveshare 2.16)](009-firmware-device/spec.md)       | Draft       |
| 010 | [Agents over ACP](010-acp-agents/spec.md)                             | Done        |
| 011 | [Ask on the charm](011-ask-on-charm/spec.md)                          | Done        |
| 012 | [Charm tools for the agent (MCP)](012-charm-tools/spec.md)            | Done        |
| 013 | [The desktop charm](013-desktop-charm/spec.md)                        | In progress |
| 014 | [Personalise your charm](014-personalise/spec.md)                     | In progress |
