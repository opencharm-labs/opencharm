# Deploy charmd next to your agent (DigitalOcean droplet)

This puts charmd (the charm daemon) on the same server as your agent, reachable by your charm from anywhere over `wss://`, and fenced off from the agent's own user. Design: [OPENCHARM.md](../OPENCHARM.md) "Security and permissions" and [packages/charmd/README.md](../packages/charmd/README.md). Status: built (spec 007), not yet verified on a real droplet.

**No warranty: you run this on your own server at your own risk.** Read the [disclaimer](../README.md#no-warranty). Prices and screens change; check DigitalOcean's current docs as you go.

```
 charm / emulator ──wss://charm.example.com/charm──▶ Caddy :443 (TLS) ──▶ charmd 127.0.0.1:8787 ──▶ Hermes 127.0.0.1:8642
```

## 1. The droplet

1. Create an Ubuntu LTS droplet with **SSH key authentication only** (no password).
2. Point a domain you own at it: an `A` record, e.g. `charm.example.com` → the droplet's IP.
3. Log in as a sudo user and lock the doors; only SSH and the web ports stay open:

   ```bash
   sudo ufw allow OpenSSH
   sudo ufw allow 80,443/tcp
   sudo ufw enable
   ```

## 2. Your agent

Install Hermes Agent following its docs, then turn its API server on **for this machine only** (in Hermes' `.env`). On your own computer charmd would start Hermes itself over ACP; here it talks to Hermes' API instead, so Hermes and charmd keep separate users and can't read each other's keys.

```bash
API_SERVER_ENABLED=true
API_SERVER_HOST=127.0.0.1
API_SERVER_PORT=8642
API_SERVER_KEY=<a long random string>
```

Restart Hermes and check it answers locally: `curl -s -H "Authorization: Bearer <key>" http://127.0.0.1:8642/v1/models`.

(OpenClaw: enable the Gateway's OpenAI chat completions endpoint, keep the Gateway on loopback, and set `"agent": { "adapter": "openclaw", "baseUrl": "http://127.0.0.1:<port>/v1" }` in charmd's config after step 3; its token goes in `charmd.env` as `OPENCLAW_GATEWAY_TOKEN=…`.)

## 3. charmd

Node 24, then the CLI, then setup:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g opencharm
sudo opencharm setup --domain charm.example.com --dry-run   # read what it will do
sudo opencharm setup --domain charm.example.com
```

Setup:

- creates the `charmd` system user
- creates `/var/lib/charmd` (0700: state and the admin socket)
- creates `/etc/opencharm` (0750 root:charmd), with the config in `charmd.json` and the keys in `charmd.env`, both 0640
- installs the hardened `charmd.service` (no new privileges, read-only system, no home, private tmp and devices, empty capability sets, restricted address families and namespaces, `UMask=0077`) and enables it (it starts once your keys are in)
- prints the Caddy block

It refuses non-public domain names (Caddy needs one for a certificate) and a Node or CLI installed under `/home` or `/root` (hidden from the service). `--dry-run` prints the plan without changing anything.

Put your keys in the env file and start it:

```bash
sudo nano /etc/opencharm/charmd.env     # OPENAI_API_KEY=…  API_SERVER_KEY=<Hermes' key>
sudo systemctl start charmd
sudo systemctl status charmd
```

## 4. Caddy (TLS)

Install Caddy from its official apt repository, then make `/etc/caddy/Caddyfile`:

```
charm.example.com {
  reverse_proxy 127.0.0.1:8787
}
```

`sudo systemctl reload caddy`. Caddy gets and renews the certificate on its own.

## 5. Pair

On the charm (or in the emulator on your laptop: `opencharm sim --url wss://charm.example.com/charm`), a 6-digit code appears:

```bash
sudo -u charmd opencharm pair <code> --name pip --config /etc/opencharm/charmd.json
sudo -u charmd opencharm status --config /etc/opencharm/charmd.json
```

Lost it? `sudo -u charmd opencharm lock pip …` (or `revoke`) with the same `--config`.

## 6. Check the fences

```bash
systemd-analyze security charmd                  # exposure score (lower is better); note it in this guide
sudo ss -tlnp | grep -E ':8787|:8642'            # both on 127.0.0.1 only
sudo -u <hermes-user> cat /etc/opencharm/charmd.json /var/lib/charmd/state.json   # must say Permission denied
nc -zv -w 5 charm.example.com 8787               # run from your laptop; must fail: only Caddy faces the internet
```

Logs: `journalctl -u charmd -f`. Each turn logs one JSON line with its timings; transcripts only if you set `logTranscripts: true`.
