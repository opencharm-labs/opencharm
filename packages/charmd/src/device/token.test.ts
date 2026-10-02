import type { IncomingMessage } from "node:http";

import { describe, expect, it } from "vitest";

import { SUBPROTOCOL, tokenFrom } from "./token";

function req(
  url: string,
  remote: string,
  headers: Record<string, string> = {}
): IncomingMessage {
  return {
    url,
    headers,
    socket: { remoteAddress: remote },
  } as unknown as IncomingMessage;
}

const TOKEN = "a".repeat(43);

describe("tokenFrom", () => {
  it("reads the Authorization header (what the charm sends)", () => {
    expect(
      tokenFrom(
        req("/charm", "203.0.113.5", { authorization: `Bearer ${TOKEN}` })
      )
    ).toBe(TOKEN);
  });

  it("reads the token subprotocol (what the emulator sends: browsers can't set other headers)", () => {
    expect(
      tokenFrom(
        req("/charm", "203.0.113.5", {
          "sec-websocket-protocol": `${SUBPROTOCOL}, ${SUBPROTOCOL}.token.${TOKEN}`,
        })
      )
    ).toBe(TOKEN);
  });

  it("never reads a token from the URL, not even from loopback (behind Caddy everything is loopback)", () => {
    expect(
      tokenFrom(req(`/charm?token=${TOKEN}`, "127.0.0.1"))
    ).toBeUndefined();
  });

  it("prefers the header when both are present", () => {
    expect(
      tokenFrom(
        req("/charm", "127.0.0.1", {
          authorization: `Bearer ${TOKEN}`,
          "sec-websocket-protocol": `${SUBPROTOCOL}.token.other`,
        })
      )
    ).toBe(TOKEN);
  });

  it("rejects malformed tokens", () => {
    expect(
      tokenFrom(req("/charm", "127.0.0.1", { authorization: "Basic abc" }))
    ).toBeUndefined();
    expect(
      tokenFrom(
        req("/charm", "127.0.0.1", {
          "sec-websocket-protocol": `${SUBPROTOCOL}.token.a b`,
        })
      )
    ).toBeUndefined();
  });
});
