# 002: charmd core (sessions, pairing, PIN, lock)

Status: Approved
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
- **Charms that wait, and being found** (maintainer, 12 October 2026, for adding a board from the app, spec 013):
  - admin `waiting`: the charms connected and waiting to pair, each with the code on its screen, what it runs (`build.kind`) and how long the code lasts. The app lists them; `opencharm pair` with no code says how many wait and asks for the code on the charm's screen (typed even when one waits, never shown: it's read off the charm).
  - `network` (`{ host, port }`, needs `allowInsecureRemote`): a second listener for charms on the home network, beside `listen`, so the desktop app keeps its own charm on loopback at a port the system picks (security review, 12 October 2026: a fixed loopback port could be taken first by another local user).
  - When charmd listens beyond this computer (`network`, or `listen.host` not loopback), it announces itself on the local network by mDNS, service `_opencharm._tcp`, with that listener's port and `path=/charm` (`"discoverable": false` turns it off). Never on loopback: nothing could reach it there.
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

- [ ] `waiting` lists a charm waiting to pair with its code and kind, and nothing once it's paired (admin tests); `opencharm pair` with no code lists them (CLI test); a charmd on a non-loopback host announces `_opencharm._tcp` with its port, and one on loopback doesn't (daemon test).
