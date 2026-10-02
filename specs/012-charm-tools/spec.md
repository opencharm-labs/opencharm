# 012: Charm tools for the agent (MCP)

Status: Done
Depends on: 010, 011

## Why

So far the agent can only answer when spoken to. With tools it can use the charm itself: speak up with a reminder, show how it feels, ask a yes/no question before acting, or light the orange "it needs you". MCP is the standard every agent we support already speaks, so the charm becomes one more MCP server.

## Scope

- **`opencharm mcp`**: an MCP server over stdio (no dependencies; protocol versions 2025-06-18, 2025-03-26, 2024-11-05) that forwards to the running charmd through its admin socket. Tools:
  - `say(text)`: speak on the charm now, e.g. a reminder; normal replies are spoken already
  - `show_face(face, line?)`: one of the agent states (`done`, `thinking`, `stuck`, `asleep`…), with an optional short line
  - `ask(question, yes?, no?)`: a yes/no question on the charm (hold = yes, press = no, 30 s silence = no); returns `yes` or `no`
  - `notify(text)`: the orange "it needs you" face with a short line, until the person presses the key
- **Which charm:** the tools act on the charm that is connected and unlocked. If several are, the latest one wins. If none is, the tool returns an error the agent can read ("No charm is connected and unlocked").
- **ACP agents get it automatically:** charmd adds `opencharm mcp` to every ACP session (`mcpServers`, stdio), with charmd's admin socket (`--socket`). It's off with `"agent": { …, "charmTools": false }`.
- **Other agents** running as the same user (outside ACP): add `opencharm mcp --config <file>` to the agent's own MCP settings. Documented, not automated. Never across a user boundary such as the droplet: the admin socket can also unlock a charm without its PIN.
- **Admin socket:** `say`, `face`, `ask` and `notify` work without naming a charm. Pairing and locking stay out of the MCP server.

## Not in scope

Readable signals (picked up, battery…), MCP over HTTP (charmd behind Caddy must not expose it), per-tool permissions.

## Acceptance

- [x] MCP server tests: `initialize` with version negotiation, `tools/list`, each tool's `tools/call`, bad arguments, unknown tool, `ping`, no charm connected.
- [x] ACP sessions carry the `charm` MCP server (fake agent log); `charmTools: false` leaves it out.
- [x] Real Claude Code over ACP calls `show_face` and `ask` on a charm and acts on the answer.
- [x] `npm run check` green; docs in sync (SPEC, charmd and CLI READMEs, skills, starter).

## Notes (1 October 2026)

- 10 MCP server tests, a stdio loop test, ACP and wiring tests, and an admin test for tools without a charm name.
- Real Claude Code in a starter clone: "show the done face with All set, then ask me whether to order pizza" → the face showed, "Order pizza?" appeared on the charm, and the answer came back (yes and no both checked).
- Found on the way: every charm tool call first asked permission ("Claude Code wants to use the charm tool show_face"). Claude Code's allow rules in settings (`mcp__charm`, `mcp__charm__*`, the exact tool name) don't reach MCP tools through the ACP adapter; the SDK's `allowedTools` option does, so the `claude` preset sets it. Permission questions for other MCP tools now read "use the gmail tool send_email".
- A fresh review found and fixed:
  - `say` during a turn cancelled the reply that asked for it; it's now refused with a readable reason
  - faces from `notify` and `show_face` were wiped when the turn ended; now they're kept
  - a tool's `ask` didn't pause the turn's clock; now it goes through the turn
  - the docs offered `opencharm mcp` across a user boundary
  - a non-object JSON line crashed the server
  - charmd guessed its own command line from `process.argv`; the CLI now passes it, without debugger flags
- Deferred: `notifications/cancelled` from the agent doesn't withdraw a question yet (it times out in 30 s); `allowedTools: ["mcp__charm"]` would also allow a workspace MCP server named `charm` (it would need a malicious workspace).
