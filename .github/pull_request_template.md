<!-- Title: a conventional commit (`fix(cli): …`, `feat(design): …`). The pull request is squash-merged, so the title becomes its commit on main; a fix, feat or perf title also becomes a release and its notes. -->

## Why

The problem this solves, for whom. Feature: link its spec (`specs/NNN-<slug>/spec.md`). Fix, perf, docs, CI or chore: no spec; link the issue if there is one. Closes #

## What changed

-

## Evidence

How you know it works: the tests or commands you ran and their result, a screenshot or a measurement. Name any manual check.

Independent review (fresh context, AGENTS.md): the tool, what it found, what was fixed, and what was rejected and why.

## Checklist

- [ ] `npm run check` passes
- [ ] Docs this change makes wrong are updated (`OPENCHARM.md`, the README next to the code)
- [ ] Feature: every acceptance item is proven, and the status in the spec and `specs/README.md` is updated

## Follow-ups

-
