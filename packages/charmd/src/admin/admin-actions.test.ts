import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PairingRegistry } from "../auth/pairing";
import type { Session } from "../device/session";
import { CharmLook } from "../look";
import { StateStore } from "../store/state-store";
import { createAdminActions } from "./admin-actions";

type FakeSession = {
  charmId: string;
  state: string;
  answering: number | undefined;
};

function setup(live: FakeSession[] = []) {
  const store = new StateStore(
    join(mkdtempSync(join(tmpdir(), "oc-actions-")), "state.json")
  );
  for (const [id, name] of [
    ["c_aaaaaa", "pip"],
    ["c_bbbbbb", "desk"],
  ] as const)
    store.put({
      id,
      name,
      tokenHash: "0".repeat(64),
      pinHash: "x",
      failedTries: 0,
      blocked: false,
      createdAt: "2026-10-13T00:00:00.000Z",
    });
  const started: string[] = [];
  const actions = createAdminActions({
    store,
    pairing: new PairingRegistry({ ttlMs: 60_000, maxPending: 4 }),
    sessions: () => live as unknown as Session[],
    look: new CharmLook(
      { colour: "white", sleepAfterMinutes: 4, motion: "full", volume: 85 },
      "Pip"
    ),
    agentCanChangeLook: true,
    newConversation: (sessionKey) => started.push(sessionKey),
  });
  return { actions, started };
}

describe("the admin command newConversation", () => {
  it("starts over every paired charm when none is named", async () => {
    const { actions, started } = setup();
    expect(await actions.newConversation({})).toEqual({
      charms: ["pip", "desk"],
    });
    expect(started).toEqual(["opencharm-c_aaaaaa", "opencharm-c_bbbbbb"]);
  });

  it("starts over only the named charm, connected or not", async () => {
    const { actions, started } = setup();
    expect(await actions.newConversation({ charm: "desk" })).toEqual({
      charms: ["desk"],
    });
    expect(started).toEqual(["opencharm-c_bbbbbb"]);
    await expect(actions.newConversation({ charm: "nobody" })).rejects.toThrow(
      /No charm called "nobody"/
    );
  });

  it("from the agent's tool, starts over the charm the agent is answering, not one just listening", async () => {
    const { actions, started } = setup([
      { charmId: "c_aaaaaa", state: "unlocked", answering: 7 },
      // Key held on the other charm: listening, which isn't an agent turn.
      { charmId: "c_bbbbbb", state: "unlocked", answering: undefined },
    ]);
    expect(await actions.newConversation({ source: "agent" })).toEqual({
      charms: ["pip"],
    });
    expect(started).toEqual(["opencharm-c_aaaaaa"]);
  });

  it("from the agent's tool with two charms being answered, starts over only the newest turn's", async () => {
    const { actions, started } = setup([
      { charmId: "c_aaaaaa", state: "unlocked", answering: 9 },
      { charmId: "c_bbbbbb", state: "unlocked", answering: 4 },
    ]);
    expect(await actions.newConversation({ source: "agent" })).toEqual({
      charms: ["pip"],
    });
    expect(started).toEqual(["opencharm-c_aaaaaa"]);
  });

  it("from the agent's tool with no agent turn running, changes nothing", async () => {
    const { actions, started } = setup([
      { charmId: "c_aaaaaa", state: "unlocked", answering: undefined },
      { charmId: "c_bbbbbb", state: "locked", answering: 3 },
    ]);
    expect(await actions.newConversation({ source: "agent" })).toEqual({
      charms: [],
    });
    expect(started).toEqual([]);
  });

  it("refuses anything it doesn't know, rather than starting over every charm", async () => {
    const { actions, started } = setup();
    await expect(actions.newConversation({ charms: "pip" })).rejects.toThrow();
    await expect(actions.newConversation({ source: "cli" })).rejects.toThrow();
    expect(started).toEqual([]);
  });
});

describe("voices", () => {
  it("passes on the speaking voice's choices", async () => {
    const store = new StateStore(
      join(mkdtempSync(join(tmpdir(), "oc-actions-")), "state.json")
    );
    const actions = createAdminActions({
      store,
      pairing: new PairingRegistry({ ttlMs: 60_000, maxPending: 4 }),
      sessions: () => [],
      look: new CharmLook(
        { colour: "white", sleepAfterMinutes: 4, motion: "full", volume: 85 },
        "Pip"
      ),
      agentCanChangeLook: true,
      voices: () => Promise.resolve([{ id: "a1", name: "Ada" }]),
    });
    expect(await actions.voices()).toEqual({
      voices: [{ id: "a1", name: "Ada" }],
    });
  });
});
