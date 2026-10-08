# 004: Workspace

Status: Done
Depends on: 003, 010

## Why

The simplest way to use a charm: your agent lives in a folder you own, run on your own machine, with charmd and the emulator (or the charm) next to it. Everything local, in git, easy to fork and change. Developers who run coding agents expect to clone a repo, tweak it with their own agent and pull fixes later, so the workspace is a repo of its own with two audiences kept apart: the voice agent (with guarded permissions) and the developer customising it.

## Scope

- **`opencharm-labs/opencharm-starter`**, its own repo and the single source of truth (a GitHub template):
  - The root, for developers and their coding agents: `README.md`, `AGENTS.md` (+ `CLAUDE.md` → `@AGENTS.md`), skill `customise-charm`, `opencharm.json`, tests (`node --test`, no dependencies), CI, MIT licence.
  - `charm/`, the **workspace** the voice agent runs in: its persona (`AGENTS.md`, default name Momo: 1–3 short spoken sentences, no markdown, what it may and may not do), skills `charm-voice` and `charm-workspace`, `notes/` (what you ask it to remember, plain Markdown in git), and Claude Code rules (`.claude/settings.json`; with `"mode": "auto"` in `opencharm.json` it may run commands and edit its project folders, Claude Code's reviewer approving or blocking each action; its own rules and charmd's state off limits). Until 8 October 2026 it was locked down (edits inside `charm/` only, no shell); spec 010 has why that changed.
  - charmd's state stays in `~/.opencharm/` (its default), outside the repo, denied to the voice agent.
- **`opencharm init [dir]`** (`packages/cli/src/commands/init.ts`) clones the starter (`git clone --depth 1 --origin upstream`, so fixes can be pulled later; `--from <url or path>` for forks), then fits `opencharm.json` to this machine: `local` voice on macOS, `fake` elsewhere; `--agent` picks an ACP preset (Claude Code by default). The CLI bundles no template. The charm's name lives in `charm/AGENTS.md` (`--name` overrides it in `opencharm.json`); init prints it, with the next steps: `serve`, `sim` (the charm in the browser, without hardware) and `pair`.
- **`opencharm serve`** from the workspace runs the agent in `charm/`.
- Naming: "workspace" everywhere current (CLI, `OPENCHARM.md`, READMEs, skills, code comments).
- The starter's git flow: trunk-based, like the main repo: a short branch from `main`, then a pull request to `main` that the maintainer merges.

## Decisions

- The workspace is its own repo, not a template inside the CLI, and the developer's root is separate from the voice agent's `charm/` (1 October 2026).
- charmd's state lives in `~/.opencharm/`: Claude Code ignores `../` paths in permission rules (it asks instead), so home-relative deny rules are used, verified against the real agent (1 October 2026).

## Not in scope

Approving permissions on the charm (011), charmd's MCP server (012), publishing to npm, Hermes and OpenClaw workspaces (they have their own).

## Acceptance

- [x] The starter's 11 tests pin the voice agent's rules and the config; CI runs `node --test`. Its first CI run not yet checked.
- [x] `opencharm init` from a local copy of the starter works (unit tests with a temp git repo, `init.test.ts`) and from GitHub.
- [x] A real turn with Claude Code in a starter clone: it answers, remembers a note in `charm/notes/`, and refuses editing its rules, running a shell command and reading charmd's state (`~/.opencharm/`).
- [x] "Remember that my bike is in the garage" survives a charmd restart: "Where is my bike?" is answered from the note (`packages/charmd/scripts/smoke-turn.ts`).
- [x] A coding agent opened at the starter's root can edit `charm/AGENTS.md`.
- [x] `npm run check` green; docs in sync in both repos.
