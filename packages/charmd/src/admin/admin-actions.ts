import { FACE_STATES } from "@opencharm-labs/protocol/constants";
import { z } from "zod";

import type { PairingRegistry } from "../auth/pairing";
import type { Session } from "../device/session";
import { type CharmLook, type Look, lookFields } from "../look";
import type { StateStore } from "../store/state-store";

type CharmStatus = {
  id: string;
  name: string;
  blocked: boolean;
  failedTries: number;
  connected: boolean;
  state: string;
  build: { kind: string; version: string; commit: string } | undefined;
};
type AdminActions = {
  pair: (input: unknown) => Promise<{ id: string; name: string }>;
  lock: (input: unknown) => Promise<{ connected: number }>;
  unlock: (input: unknown) => Promise<{ connected: number }>;
  revoke: (input: unknown) => Promise<{ connected: number }>;
  status: () => { charmd: string; charms: CharmStatus[] };
  devFace: (input: unknown) => Promise<{ connected: number }>;
  devSay: (input: unknown) => Promise<{ connected: number }>;
  devAsk: (input: unknown) => Promise<{ answer: "yes" | "no" }>;
  look: (input: unknown) => Promise<Look & { connected: number }>;
};
type AdminDeps = {
  store: StateStore;
  pairing: PairingRegistry;
  sessions: () => Iterable<Session>;
  look: CharmLook;
  agentCanChangeLook: boolean;
  // What this charmd is (spec 015): the CLI that runs it passes its identity.
  identity?: string;
};

const pairInput = z.object({
  code: z.string().regex(/^\d{6}$/, "the code has 6 digits"),
  pin: z.string().regex(/^\d{4,12}$/, "the PIN is 4 to 12 digits"),
  name: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9-]{0,39}$/i,
      "names are letters, digits and hyphens"
    )
    .default("charm"),
});
const charmInput = z.object({ charm: z.string().min(1) });
// The charm tools (opencharm mcp) don't name a charm: the connected, unlocked one answers.
const anyCharmInput = z.object({ charm: z.string().min(1).optional() });
const devFaceInput = anyCharmInput.extend({
  state: z.enum(FACE_STATES as [string, ...string[]], {
    error: "unknown face state",
  }),
  text: z.string().max(200).optional(),
});
const devSayInput = anyCharmInput.extend({ text: z.string().min(1).max(500) });
// Strict, so a request can't slip in agentCanChangeLook or anything else that isn't the look.
const lookInput = z
  .object({ ...lookFields, source: z.literal("agent").optional() })
  .strict();
const devAskInput = anyCharmInput.extend({
  text: z.string().min(1).max(200),
  yes: z.string().min(1).max(12).optional(),
  no: z.string().min(1).max(12).optional(),
});

// Admin actions are async to callers; a validation error must reject, not throw synchronously.
function settled<T>(work: () => T): Promise<T> {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.issues.map((i) => i.message).join("; "));
  }
  return result.data;
}

// What the CLI can do to a running charmd. Every input is validated here because it arrives over
// the admin socket, even though only the local charmd user can reach that socket.
function createAdminActions({
  store,
  pairing,
  sessions,
  look,
  agentCanChangeLook,
  identity,
}: AdminDeps): AdminActions {
  function sessionsOf(charmId: string): Session[] {
    return [...sessions()].filter(
      (s) => s.charmId === charmId && s.state !== "closed"
    );
  }

  function requireCharm(ref: string) {
    const charm = store.find(ref);
    if (!charm)
      throw new Error(`No charm called "${ref}". See: opencharm status`);
    return charm;
  }

  function requireLive(ref?: string): Session[] {
    if (ref === undefined) {
      // Latest connection last: if several charms are unlocked, the newest one answers.
      const latest = [...sessions()]
        .filter((s) => s.state === "unlocked")
        .at(-1);
      if (!latest) throw new Error("No charm is connected and unlocked.");
      return [latest];
    }
    const live = sessionsOf(requireCharm(ref).id).filter(
      (s) => s.state === "unlocked"
    );
    if (live.length === 0)
      throw new Error(`"${ref}" is not connected and unlocked.`);
    return live;
  }

  return {
    async pair(input) {
      const { code, pin, name } = parseInput(pairInput, input);
      if (store.find(name))
        throw new Error(`A charm called "${name}" already exists.`);
      const connectionId = pairing.claim(code);
      const session = connectionId
        ? [...sessions()].find((s) => s.connectionId === connectionId)
        : undefined;
      if (!session)
        throw new Error(
          "That code is wrong or expired. Use the code on the charm's screen now."
        );
      await session.completePairing(name, pin);
      const charm = requireCharm(name);
      return { id: charm.id, name: charm.name };
    },
    lock(input) {
      return settled(() => {
        const charm = requireCharm(parseInput(charmInput, input).charm);
        const live = sessionsOf(charm.id);
        for (const session of live) session.lockRemote();
        return { connected: live.length };
      });
    },
    unlock(input) {
      return settled(() => {
        const charm = requireCharm(parseInput(charmInput, input).charm);
        store.put({ ...charm, blocked: false, failedTries: 0 });
        const live = sessionsOf(charm.id);
        for (const session of live) session.unlockByAdmin();
        return { connected: live.length };
      });
    },
    revoke(input) {
      return settled(() => {
        const charm = requireCharm(parseInput(charmInput, input).charm);
        store.remove(charm.id);
        const live = sessionsOf(charm.id);
        for (const session of live) session.revoke();
        return { connected: live.length };
      });
    },
    devFace(input) {
      return settled(() => {
        const { charm: ref, state, text } = parseInput(devFaceInput, input);
        const live = requireLive(ref);
        for (const session of live) session.devFace(state, text);
        return { connected: live.length };
      });
    },
    devSay(input) {
      return settled(() => {
        const { charm: ref, text } = parseInput(devSayInput, input);
        const live = requireLive(ref);
        for (const session of live) session.devSay(text);
        return { connected: live.length };
      });
    },
    // Waits for the person: up to 30 s, then "no".
    async devAsk(input) {
      const { charm: ref, text, yes, no } = parseInput(devAskInput, input);
      const session = requireLive(ref).at(-1);
      if (session?.state !== "unlocked")
        throw new Error("The charm must be unlocked first.");
      const answer = await session.devAsk(text, {
        ...(yes ? { yes } : {}),
        ...(no ? { no } : {}),
      });
      return { answer: answer ? "yes" : "no" };
    },
    // Every connected charm shares one look. Nothing is written to opencharm.json: a change lasts
    // until charmd restarts (for the agent, a try-on).
    look(input) {
      return settled(() => {
        const { source, ...update } = parseInput(lookInput, input);
        if (Object.keys(update).length === 0)
          return { ...look.current(), connected: 0 };
        if (source === "agent" && !agentCanChangeLook)
          throw new Error(
            "The agent may not change the charm's look here (charm.agentCanChangeLook is false in opencharm.json)."
          );
        const next = look.apply(update);
        const message = look.message();
        const live = [...sessions()].filter((s) => s.state === "unlocked");
        for (const session of live) session.sendLook(message);
        return { ...next, connected: live.length };
      });
    },
    status() {
      return {
        charmd: identity ?? "unknown",
        charms: store.list().map((charm) => {
          const live = sessionsOf(charm.id).at(-1);
          return {
            id: charm.id,
            name: charm.name,
            blocked: charm.blocked,
            failedTries: charm.failedTries,
            connected: live !== undefined,
            state: live?.state ?? "offline",
            build: live?.build,
          };
        }),
      };
    },
  };
}

export { createAdminActions };
export type { AdminActions, CharmStatus };
