---
name: opencharm-spec-workflow
description: Use when starting, planning, building or finishing any change in the OpenCharm repo. Covers what gets a spec (features only), numbered specs in specs/, plan.md, branches and PRs, spec status, and keeping OPENCHARM.md in sync.
---

# OpenCharm spec workflow

`OPENCHARM.md` says what the product is. `specs/NNN-<slug>/spec.md` says what one change adds. Numbers only grow; never renumber.

## Features only

A spec is for a feature: something someone can do with OpenCharm afterwards that they couldn't before, or a change in how a feature behaves for them. Everything else isn't a spec and goes straight to a branch:

- bug fixes, refactors, performance work, tests
- docs and `OPENCHARM.md` edits, cleanups
- CI, releases, guards, tooling, dependency updates
- spikes and research (record what was learnt in the README of that area)

Use `fix/…`, `perf/…`, `docs/…`, `chore/…` or `ci/…` branches, with the docs they touch updated in the same change. Never create a spec folder for them. If you're unsure, ask the maintainer.

## One living spec per feature

A spec describes its feature as it is now. An improvement or change to an existing feature updates that feature's spec in place; never open a new spec for it.

- Proposals wait under `Next`.
- Once approved, they move into Scope and Acceptance and the status goes back to `Approved`.
- `plan.md` exists only while a spec is being built; delete it when the spec is Done.
- Numbers are identifiers: never reused or renumbered (retired numbers are listed in `specs/README.md` and skipped by `spec:new`).

## Lifecycle

| Status      | Who sets it        | Meaning                        |
| ----------- | ------------------ | ------------------------------ |
| Draft       | author             | being written                  |
| Approved    | maintainer         | may be planned and built       |
| In progress | builder            | `plan.md` exists, branch open  |
| Done        | builder, in the PR | merged; `OPENCHARM.md` updated |
| Dropped     | maintainer         | abandoned; keeps its number    |

Update the status in the spec **and** the row in `specs/README.md` (the checks compare them).

## Steps

1. New work: `npm run spec:new <slug>`; fill Why, Scope, Not in scope, Acceptance (one page).
2. After approval: write `plan.md` next to it: tasks with exact files, interfaces, test-first steps, commands with expected output.
3. Branch `spec/NNN-<slug>` from an up-to-date `main` (or a git worktree). Commit per task, conventional commits.
4. Each acceptance item must be proven by a test, a command or a named manual check.
5. Before the merge: `npm run check` green; update `OPENCHARM.md`, the README next to the changed code and any doc the change touches; set status Done in the spec and in the index in `specs/README.md`.
6. Pull request: once `npm run check` is green, push the branch and open a PR against `main` (trunk-based: `main` is the only long-lived branch). Link the spec and the GitHub issue; list follow-ups instead of widening scope. The maintainer reviews and merges it with a merge commit; never merge your own PR.

## Working from a GitHub issue (OpenClaw, Codex and other agents)

The issue form "Spec task" names the spec and the task. Read that spec and its plan, work in a worktree, open a PR against `main`, report the PR link. Never push to `main`.
