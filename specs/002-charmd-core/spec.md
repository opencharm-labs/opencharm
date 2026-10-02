# 002: charmd core (sessions, pairing, PIN, lock)

Status: Done
Depends on: 001

## Why

charmd, the charm daemon, is the door and the guard between the charm and the agent. This spec builds the door and the guard; voice and the agent come in 005.

## Scope

- `packages/charmd` (`@opencharm-labs/charmd`), one folder per feature under `src/`:
  - `device/`: WebSocket server (`ws`), sessions, XiaoZhi `hello`, per-charm state machine (unpaired → locked → unlocked → listening → thinking → speaking), size limits, connection cap, unpaired timeout 120 s, `/ota/` config endpoint.
  - `auth/`: pairing codes (6 digits, 300 s), tokens (32 random bytes, SHA-256 stored), PIN (scrypt), wrong-try counter (5 → blocked), lock on connect after boot, remote lock, revoke.
  - `store/`: one JSON state file, atomic writes (temp + rename), file mode 0600.
  - `admin/`: local admin interface used by the CLI: `pair`, `lock`, `unlock`, `revoke`, `status`.
  - `env.ts` / config: zod-validated config file (`/etc/opencharm/charmd.json` in production, a local path in dev).
- `packages/cli`: `opencharm serve`, `opencharm pair|lock|unlock|revoke|status`.
- Dev mode: plain `ws://` allowed only from localhost.
- Skill `opencharm-charmd` (security rules, adding features).
- `packages/charmd/README.md`: what charmd is and how its features fit, drawn from `OPENCHARM.md` "charmd".

## Not in scope

Speech, agents, turn flow (003); deployment, Caddy, systemd (007).

## Acceptance

- [x] Integration test with a fake charm: pair → set PIN → unlock → reconnect is locked → unlock again.
- [x] 5 wrong PINs → blocked; `unlock` from admin restores.
- [x] `lock` reaches a connected charm within 2 s; `revoke` sends `revoked` and the old token is rejected.
- [x] Audio and `listen` before `unlocked` are ignored and answered with `locked`.
- [x] Oversized frame → connection closed; unpaired connection closed after 120 s (fake timers).
- [x] State file contains no plaintext token or PIN; mode 0600.
