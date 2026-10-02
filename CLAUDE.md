@AGENTS.md

## Claude Code only

- Skills live in `.agents/skills/` and appear here through the `.claude/skills` symlink.
- A PostToolUse hook runs Prettier on every file you edit (`.claude/hooks/format-edited-file.mjs`).
- Plans for a spec go in `specs/NNN-<slug>/plan.md`, not in `docs/superpowers/` (that folder is gitignored scratch).
- Prefer Read/Edit/Grep over shell `cat`/`sed`/`grep`.
