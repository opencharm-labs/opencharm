# 009 Droplet deploy: plan

Spec: `specs/007-droplet-deploy/spec.md`. Executed inline.

## Decisions

- **Security review finding (fixed here)**: behind Caddy every connection reaches charmd from 127.0.0.1, so spec 006's "`?token=` only from loopback" would accept tokens in URLs from the internet (and proxies log URLs). Tokens now never go in URLs: the emulator offers the WebSocket subprotocols `opencharm` and `opencharm.token.<token>` (a header browsers _can_ set, carried inside TLS); charmd selects `opencharm`. The charm keeps `Authorization: Bearer`.
- **`opencharm setup`** (Linux, run with sudo) is a plan of steps printed before running (`--dry-run` prints only):
  1. system user `charmd` (no login shell, home `/var/lib/charmd`);
  2. `/var/lib/charmd` `0700 charmd:charmd` (state + admin socket);
  3. `/etc/opencharm` `0750 root:charmd`; `charmd.json` `0640 root:charmd` (no secrets: listen on loopback, `publicUrl`, voice `openai`, agent `hermes`); `charmd.env` `0640 root:charmd` with `OPENAI_API_KEY=` and `API_SERVER_KEY=` to fill in; existing files are never overwritten;
  4. `/etc/systemd/system/charmd.service`, hardened (`NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, `PrivateDevices`, `ReadWritePaths=/var/lib/charmd`, empty capability sets, `RestrictAddressFamilies`, `RestrictNamespaces`, `LockPersonality`, `SystemCallArchitectures=native`, `UMask=0077`), `EnvironmentFile=/etc/opencharm/charmd.env`, restart on failure;
  5. `systemctl daemon-reload` and `enable --now charmd`;
  6. prints the Caddy block for `--domain` and the next steps (fill the env file, `sudo -u charmd opencharm pair …`).
- The plan is a pure function (`planSetup`) tested for content, modes and owners; the executor is thin. It refuses to run on non-Linux or without root, with a clear message.
- **`docs/deploy.md`**: droplet (Ubuntu LTS), SSH keys only, `ufw` (22, 80, 443), Node 24, Hermes with the API server on 127.0.0.1, Caddy, `npm i -g opencharm`, `sudo opencharm setup --domain …`, pairing, verification (`systemd-analyze security charmd`, the Hermes user can't read charmd's files, nothing listens publicly but Caddy).

## Tasks

1. Token by subprotocol (charmd + emulator), tests; remove the URL token.
2. `planSetup` + unit tests (paths, modes, owners, unit hardening lines, never overwrite).
3. `opencharm setup` executor + CLI wiring (+ `--dry-run`), tests for refusals.
4. `docs/deploy.md`, OPENCHARM.md §10 (deploy, security review), charmd README; acceptance items that need a real droplet stay open until the maintainer creates one.
