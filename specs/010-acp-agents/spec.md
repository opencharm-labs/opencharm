# 010: Agents over ACP

Status: Done
Depends on: 003, 004

## Why

A charm should work with the agent a developer already runs, through the standard those agents already speak, without charmd growing one adapter per agent. ACP (Agent Client Protocol, agentclientprotocol.com) is that standard for "a client drives an agent": Hermes (`hermes acp`), OpenClaw (`openclaw acp`), Gemini CLI and goose speak it natively; Claude Code and Codex through official adapters. It also carries what the charm needs: streamed replies, cancel, and permission requests. Research and sources: maintainer discussion, 30 September 2026.

## Scope

- charmd is an **ACP client** (official SDK `@agentclientprotocol/sdk`, ACP v1, stdio). Config: `"agent": { "adapter": "acp", "agent": "claude" }` with presets `claude`, `codex`, `gemini`, `hermes`, `openclaw`, `goose` (adapters pinned to exact versions), or `"command": [...]` for any ACP agent. `cwd` (default: the config's folder) and `projects` (extra folders the agent may work in, sent as `additionalDirectories`).
- One agent process for charmd, one ACP session per charm; started on key-down (warm), restarted after a crash. Text chunks stream into speech; tool calls between texts become a line break; a key press sends `session/cancel`.
- charmd offers the agent no file or terminal access of its own (text in, text out). Permission requests are **rejected** for now and logged; approving on the charm is spec 011.
- The hand-written Claude Code adapter is removed: `claude` over ACP replaces it. `opencharm init` writes the ACP config.
- HTTP adapters (OpenAI-compatible, OpenClaw, Hermes) stay for agents behind a user boundary, like the droplet (spec 007), where charmd must not start the agent under its own user.
- Tests with a fake ACP agent; the emulator end-to-end test runs through ACP.
- Docs: SPEC, charmd README, CLI help, charm home template, skills.

## Not in scope

Approving permissions on the charm (011), charmd's MCP server for the agent to reach the charm (012), remote ACP transports (still a draft), the workspace as its own repo (004).

## Acceptance

- [x] Unit tests: streaming, line break after a tool call, cancel, permission rejected, crash then restart, missing command, auth required.
- [x] Emulator end to end passes through a fake ACP agent.
- [x] A real turn through `claude-agent-acp` in a charm home on the maintainer's Mac, on the Claude subscription, with latency to first audio measured against the old adapter (about 3.1 s warm).
- [x] The charm home's rules hold over ACP: editing `AGENTS.md` and running a shell command are refused; remembering a note works.
- [x] `npm run check` green; docs in sync.

## Notes (1 October 2026)

- 22 ACP tests against a real ACP agent process (`src/agent/fixtures/fake-acp-agent.mjs`); the emulator end to end now runs through it.
- Real Claude Code over ACP (`claude-agent-acp` 0.84.0) on the maintainer's Claude login, no API key. First audio about 3.1 s warm (2.6 s with Haiku), 6.7–8 s on the first turn after a start.
- Found and fixed on the way: the adapter loaded the user's own plugins and hooks (now only the home's settings), and Claude Code ignores a folder's own `acceptEdits` until the folder is trusted (now asked for with `session/set_mode`).
- A fresh review found and fixed: a question cancelled while the agent was starting was still sent; a new question right after a cancelled one could lose its words; stopping charmd during start-up left the agent running; refusals now use "reject once", never "always".
- Not verified: Codex, Gemini, goose, Hermes and OpenClaw over ACP (not installed here).
