# 012: Charm tools for the agent (MCP)

Status: Approved
Depends on: 010, 011

## Why

So far the agent can only answer when spoken to. With tools it can use the charm itself: speak up with a reminder, show how it feels, ask a yes/no question before acting, or light the orange "it needs you". MCP is the standard every agent we support already speaks, so the charm becomes one more MCP server.

## Scope

- **`opencharm mcp`**: an MCP server over stdio (no dependencies; protocol versions 2025-06-18, 2025-03-26, 2024-11-05) that forwards to the running charmd through its admin socket. Tools:
  - `say(text)`: speak on the charm now, e.g. a reminder; normal replies are spoken already
  - `show_face(face, line?)`: one of the agent states (`done`, `thinking`, `stuck`, `asleep`…) or a feeling (any other face: `loved`, `wink`, `curious`, `sad`…; never `ask`, the orange one, which stays `notify`'s), with an optional short line
  - `ask(question, yes?, no?)`: a yes/no question on the charm (hold = yes, press = no, 30 s silence = no); returns `yes` or `no`
  - `notify(text)`: the orange "it needs you" face with a short line, until the person presses the key
  - `new_conversation()` (approved by the maintainer, 13 October 2026; spec 003): when the person asks to start over ("let's start over", "new conversation"), never on the agent's own initiative. The reply finishes first; once it ends, the next turn starts a fresh agent session. It acts only on the charm whose turn the agent is answering (thinking or speaking, not a charm just listening; the newest turn if several) and names no other; with no such turn it changes nothing and answers "No conversation is running on a charm right now: nothing was changed."
- **Which charm:** the tools act on the charm that is connected and unlocked. If several are, the latest one wins. If none is, the tool returns an error the agent can read ("No charm is connected and unlocked").
- **ACP agents get it automatically:** charmd adds `opencharm mcp` to every ACP session (`mcpServers`, stdio), with charmd's admin socket (`--socket`). It's off with `"agent": { …, "charmTools": false }`.
- **Other agents** running as the same user (outside ACP): add `opencharm mcp --config <file>` to the agent's own MCP settings. Documented, not automated. Never across a user boundary such as the droplet: the admin socket can also unlock a charm without its PIN.
- **Admin socket:** `say`, `face`, `ask` and `notify` work without naming a charm; `new_conversation` sends `newConversation` with `source: "agent"`. Pairing and locking stay out of the MCP server.

## Not in scope

Readable signals (picked up, battery…), MCP over HTTP (charmd behind Caddy must not expose it), per-tool permissions.

## Acceptance

- [x] MCP server tests: `initialize` with version negotiation, `tools/list`, each tool's `tools/call`, bad arguments, unknown tool, `ping`, no charm connected.
- [x] ACP sessions carry the `charm` MCP server (fake agent log); `charmTools: false` leaves it out.
- [x] Real Claude Code over ACP calls `show_face` and `ask` on a charm and acts on the answer.
- [x] `npm run check` green; docs in sync (SPEC, charmd and CLI READMEs, skills, starter).
- [x] `new_conversation`: listed with a description that says when to use it, `tools/call` sends `newConversation` with `source: "agent"`, a charm name is refused; the admin command picks only the charm with the newest agent turn, never one just listening, and nothing when no agent turn runs (13 October 2026).
- [ ] Real Claude Code over ACP calls `new_conversation` when asked to start over, and the next turn doesn't know the last one.
- [x] Feelings (14 October 2026): `show_face` lists the states then the other faces; a feeling goes out as `face` `{state: "idle", feeling}` (protocol fixture for both sides) and a turn keeps one a tool showed. charmd refuses the needs_you state's face (orange) as a feeling, and a feeling next to any state but idle. A charm drops a feeling it doesn't know (or the orange one, or one over another state) and shows the state, so it's never stuck on a stale face; a charm from before draws the idle face.

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

## Next

- **A `battery` tool** (proposed with spec 009's battery report, 12 October 2026; waiting for the maintainer): returns the connected charm's battery (`62%, charging`), so the agent can mention it ("your charm is at 9 %"). charmd already keeps it per charm (`charm battery`). It would move "battery" out of Not in scope.
