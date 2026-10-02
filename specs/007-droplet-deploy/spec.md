# 007: Droplet deploy

Status: In progress
Depends on: 003

## Why

charmd runs next to the agent, reachable from anywhere over TLS, fenced off from the agent's own user. Setting that up must be one command and a short guide.

## Scope

- `opencharm setup` (run with sudo): creates system user `charmd`, `/var/lib/charmd` (0700), `/etc/opencharm/charmd.json` (`root:charmd 0640`), a systemd unit (hardened: `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, `ReadWritePaths=/var/lib/charmd`); prints the Caddy line.
- Guide `docs/deploy.md`: DigitalOcean droplet, firewall (443 + SSH keys only), Caddy, Hermes API server bound to 127.0.0.1, `sudo -u charmd opencharm pair`.
- Security review of charmd against `OPENCHARM.md` "Security".

## Not in scope

Other clouds' specifics; Docker image (later, if asked for).

## Acceptance

- [ ] On a fresh Ubuntu droplet the guide takes under 15 minutes to a paired emulator over `wss://`.
- [ ] As the Hermes user: charmd state and config are unreadable; admin commands refused.
- [ ] With the `openai` voice and the `hermes` agent on the droplet: a spoken question gets a spoken answer; first-audio time recorded in `OPENCHARM.md` (moved from spec 003).
- [ ] `systemd-analyze security charmd` exposure score recorded; no plain `ws://` reachable from outside.

## Notes (30 September 2026)

Built and tested locally: `opencharm setup` (plan unit-tested; refuses non-Linux and non-root; `--dry-run`), `docs/deploy.md`, and the security review, which moved tokens out of URLs into a WebSocket subprotocol (charmd + emulator, covered by the emulator's reload test). The four acceptance items need a real droplet, a domain and API keys; they stay open until the maintainer has them.
