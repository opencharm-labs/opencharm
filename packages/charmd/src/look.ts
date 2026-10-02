import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { facesData } from "@opencharm-labs/design/faces";
import type { ServerMessage } from "@opencharm-labs/protocol/messages";
import { SERVER_SCHEMAS } from "@opencharm-labs/protocol/messages";
import { utf8Length } from "@opencharm-labs/protocol/text";
import { z } from "zod";

type Motion = "full" | "calm";
// What opencharm.json (or a change) says; the name and greeting may be left to their defaults.
type LookSettings = {
  name?: string;
  colour: string;
  greeting?: string;
  sleepAfterMinutes: number;
  motion: Motion;
};
// The look as it is now, every default filled in.
type Look = {
  name: string;
  colour: string;
  glyph: string;
  greeting: string;
  sleepAfterMinutes: number;
  motion: Motion;
};
type LookMessage = Extract<ServerMessage, { type: "charm"; op: "look" }>;

const FALLBACK_NAME = "Charm";
const MAX_NAME_CHARS = 12;
const MAX_NAME_BYTES = 24;
const MAX_GREETING_BYTES = 40;
const COLOUR_IDS = facesData.colours.map((colour) => colour.id) as [
  string,
  ...string[],
];

// The limits match what the charm can show (packages/protocol, charm:look).
const lookName = z
  .string()
  .min(1, "the name can't be empty")
  .refine(
    (name) =>
      [...name].length <= MAX_NAME_CHARS && utf8Length(name) <= MAX_NAME_BYTES,
    { message: `at most ${MAX_NAME_CHARS} characters` }
  );
const lookFields = {
  name: lookName.optional(),
  colour: z
    .enum(COLOUR_IDS, {
      error: `the colour is one of ${COLOUR_IDS.join(", ")}`,
    })
    .optional(),
  greeting: z
    .string()
    .refine((text) => utf8Length(text) <= MAX_GREETING_BYTES, {
      message: `at most ${MAX_GREETING_BYTES} bytes`,
    })
    .optional(),
  sleepAfterMinutes: z.number().int().min(0).max(1440).optional(),
  motion: z.enum(["full", "calm"]).optional(),
};
const lookUpdateSchema = z.object(lookFields).strict();

function issues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "look"}: ${issue.message}`)
    .join("; ");
}

function glyphOf(colourId: string): string {
  const colour = facesData.colours.find((c) => c.id === colourId);
  if (!colour) throw new Error(`Unknown colour "${colourId}"`);
  return colour.g;
}

function resolve(settings: LookSettings, defaultName: string): Look {
  const name = settings.name ?? defaultName;
  return {
    name,
    colour: settings.colour,
    glyph: glyphOf(settings.colour),
    greeting: settings.greeting ?? `Hi! I'm ${name}.`,
    sleepAfterMinutes: settings.sleepAfterMinutes,
    motion: settings.motion,
  };
}

function toMessage(look: Look): LookMessage {
  const message = {
    type: "charm",
    op: "look",
    name: look.name,
    glyph: look.glyph,
    greeting: look.greeting,
    sleep_ms: look.sleepAfterMinutes * 60_000,
    motion: look.motion,
  } as const;
  // The protocol's own schema has the last word, so charmd never sends a look the charm would drop.
  const checked = SERVER_SCHEMAS["charm:look"].safeParse(message);
  if (!checked.success)
    throw new Error(`Invalid look: ${issues(checked.error)}`);
  return message;
}

// The first "# " heading of the agent's AGENTS.md is its name in the starter (e.g. "# Pip").
function nameFromAgentsMd(markdown: string): string | undefined {
  const heading = /^# +(.+)$/m.exec(markdown)?.[1]?.trim();
  if (!heading) return undefined;
  const name = [...heading].slice(0, MAX_NAME_CHARS).join("").trimEnd();
  return lookName.safeParse(name).success ? name : undefined;
}

function readAgentName(cwd: string | undefined): string {
  const path = cwd ? join(cwd, "AGENTS.md") : undefined;
  if (!path || !existsSync(path)) return FALLBACK_NAME;
  return nameFromAgentsMd(readFileSync(path, "utf8")) ?? FALLBACK_NAME;
}

// The charm's identity while charmd runs. A change lives in memory only: an agent's try-on lasts
// until charmd restarts, and opencharm.json stays the source of truth.
class CharmLook {
  #settings: LookSettings;
  readonly #defaultName: string;

  constructor(settings: LookSettings, defaultName: string) {
    this.#settings = settings;
    this.#defaultName = defaultName;
    this.message();
  }

  current(): Look {
    return resolve(this.#settings, this.#defaultName);
  }

  message(): LookMessage {
    return toMessage(this.current());
  }

  apply(update: unknown): Look {
    const parsed = lookUpdateSchema.safeParse(update);
    if (!parsed.success) throw new Error(issues(parsed.error));
    const next: LookSettings = { ...this.#settings };
    for (const [key, value] of Object.entries(parsed.data))
      if (value !== undefined) Object.assign(next, { [key]: value });
    const look = resolve(next, this.#defaultName);
    toMessage(look);
    this.#settings = next;
    return look;
  }
}

export { COLOUR_IDS, CharmLook, lookFields, nameFromAgentsMd, readAgentName };
export type { Look, LookMessage, LookSettings };
