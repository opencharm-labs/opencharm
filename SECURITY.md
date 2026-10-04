# Security

OpenCharm connects a physical device to an AI agent that can act on your behalf, so security reports matter to us.

## Reporting

Please report vulnerabilities privately through GitHub's "Report a vulnerability" (Security → Advisories) on `opencharm-labs/opencharm`. Don't open a public issue. We aim to reply within 7 days (a goal, not a promise: this is a small open-source project).

## In scope

charmd (pairing, tokens, PIN, lock, permissions, the WebSocket protocol), OpenCharm OS firmware, the emulator, the desktop app (its own charmd, automatic pairing, the keychain), the CLI, the release workflows, and the setup guides.

## Design rules we hold ourselves to

No API keys or PIN on the device; TLS with certificate checks; the mic is on only while the key is down, and nothing leaves the charm unless it's a hold; charmd's files are unreadable by the agent's user. Details: `OPENCHARM.md` "Security and permissions".

There is no bug bounty.
