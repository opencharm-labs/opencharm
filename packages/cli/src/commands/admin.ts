import { FACE_STATES } from "@opencharm-labs/protocol/constants";
import { charmBuild } from "@opencharm-labs/protocol/messages";
import { z } from "zod";

import { VALUE_FLAGS, firstPositional, flagValue } from "../args";
import type { CliContext } from "../context";

type AdminDeps = {
  socket: string;
  send: (socket: string, request: Record<string, unknown>) => Promise<unknown>;
  prompt: (question: string) => Promise<string>;
};
// What `status` prints comes from the admin socket: checked before it reaches the terminal (spec 015).
// A charm's build uses the protocol's own schema; an informational line that doesn't fit is left out
// rather than hiding the charms.
const statusSchema = z.object({
  charmd: z
    .string()
    .regex(/^[\w.@+() -]{1,96}$/)
    .optional()
    .catch(undefined),
  starter: z
    .string()
    .regex(/^[0-9a-f]{4,40}$/)
    .optional()
    .catch(undefined),
  voice: z
    .string()
    .regex(/^[\w.+()%· -]{1,160}$/)
    .optional()
    .catch(undefined),
  charms: z.array(
    z.object({
      name: z.string(),
      state: z.string(),
      blocked: z.boolean(),
      failedTries: z.number(),
      build: charmBuild.optional().catch(undefined),
      // The charm's battery (spec 009); an informational field that doesn't fit is left out.
      battery: z
        .object({
          percent: z.number().int().min(0).max(100),
          charging: z.boolean(),
          usb: z.boolean(),
        })
        .optional()
        .catch(undefined),
    })
  ),
});
type CharmRow = z.infer<typeof statusSchema>["charms"][number];
type LookRow = {
  name: string;
  colour: string;
  greeting: string;
  sleepAfterMinutes: number;
  motion: string;
  volume: number;
  connected: number;
};

// The names of the charms that start over, checked before they reach the terminal.
const newConversationAnswer = z.object({
  charms: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/i)),
});

const NEW_USAGE =
  "Usage: opencharm new [charm]   (a new conversation with your agent; every charm when none is named)";

const DONE: Record<string, string> = {
  lock: "Locked",
  unlock: "Unblocked and unlocked",
  revoke: "Revoked",
};

function fail(ctx: CliContext, message: string): void {
  ctx.err.write(`${message}\n`);
  process.exitCode = 1;
}

// No code given: the charms waiting to pair (spec 002) are listed, and the code on the charm's
// screen is typed, even when only one waits: typing it proves you're looking at your own charm,
// where a y/N would pair whatever device on the network happened to be waiting.
async function chooseWaiting(
  ctx: CliContext,
  deps: AdminDeps
): Promise<string | undefined> {
  const answer = (await deps.send(deps.socket, { cmd: "waiting" })) as {
    charms?: { code: string; kind?: string }[];
  };
  const charms = (answer.charms ?? []).filter((c) => /^\d{6}$/.test(c.code));
  if (charms.length === 0) {
    fail(
      ctx,
      "No charm is waiting to pair. Turn it on and connect it to this charmd: its screen shows a 6-digit code. Then: opencharm pair [code]"
    );
    return undefined;
  }
  ctx.out.write(
    `${charms.length === 1 ? "A charm is" : `${charms.length} charms are`} waiting to pair${charms.some((c) => c.kind) ? ` (${charms.map((c) => c.kind ?? "?").join(", ")})` : ""}.\n`
  );
  const typed = (
    await deps.prompt("Type the code on your charm's screen: ")
  ).replace(/\s/g, "");
  if (!charms.some((c) => c.code === typed)) {
    fail(ctx, "That code isn't one of them. Nothing was changed.");
    return undefined;
  }
  return typed;
}

async function pair(
  ctx: CliContext,
  args: readonly string[],
  deps: AdminDeps
): Promise<void> {
  const code = firstPositional(args) ?? (await chooseWaiting(ctx, deps));
  if (!code) return;
  const pin = await deps.prompt("Choose a PIN for the charm (4-12 digits): ");
  const again = await deps.prompt("Type it again: ");
  if (pin !== again) {
    fail(ctx, "The PINs didn't match. Nothing was changed.");
    return;
  }
  const name = flagValue(args, "--name") ?? "charm";
  const result = (await deps.send(deps.socket, {
    cmd: "pair",
    code,
    pin,
    name,
  })) as { name: string };
  ctx.out.write(`Paired ${result.name}. The charm now asks for its PIN.\n`);
}

const DEV_USAGE =
  "Usage: opencharm dev face <charm> <state|feeling> [text]   |   opencharm dev say <charm> <text>   |   opencharm dev ask <charm> <question>";

function positionals(args: readonly string[]): string[] {
  return args.filter(
    (arg, i) => !arg.startsWith("-") && !VALUE_FLAGS.has(args[i - 1] ?? "")
  );
}

async function dev(
  ctx: CliContext,
  args: readonly string[],
  deps: AdminDeps
): Promise<void> {
  const [sub, charm, ...words] = positionals(args);
  const text = words.join(" ");
  if (sub === "face" && charm && words[0]) {
    const [face, ...line] = words;
    await deps.send(deps.socket, {
      cmd: "devFace",
      charm,
      // A state by its name, else a feeling; charmd refuses anything else.
      ...(FACE_STATES.includes(face) ? { state: face } : { feeling: face }),
      ...(line.length ? { text: line.join(" ") } : {}),
    });
    ctx.out.write(`Face ${face} sent to ${charm}.\n`);
    return;
  }
  if (sub === "ask" && charm && text) {
    ctx.out.write(
      `Asking ${charm}: hold the key for yes, press for no (30 s).\n`
    );
    const { answer } = (await deps.send(deps.socket, {
      cmd: "devAsk",
      charm,
      text,
    })) as { answer: "yes" | "no" };
    ctx.out.write(
      answer === "yes"
        ? `${charm} said yes.\n`
        : `${charm} said no (or nothing).\n`
    );
    return;
  }
  if (sub === "say" && charm && text) {
    await deps.send(deps.socket, { cmd: "devSay", charm, text });
    ctx.out.write(`${charm} is saying it.\n`);
    return;
  }
  fail(ctx, DEV_USAGE);
}

async function look(
  ctx: CliContext,
  args: readonly string[],
  deps: AdminDeps
): Promise<void> {
  const volume = flagValue(args, "--volume");
  if (volume !== undefined && !/^\d{1,3}$/.test(volume)) {
    fail(ctx, "--volume is a whole number from 0 to 100. Nothing was changed.");
    return;
  }
  const flags = {
    colour: flagValue(args, "--colour") ?? flagValue(args, "--color"),
    greeting: flagValue(args, "--greeting"),
    motion: flagValue(args, "--motion"),
    // A number on the wire; charmd checks the range.
    volume: volume === undefined ? undefined : Number(volume),
  };
  const update = Object.fromEntries(
    Object.entries(flags).filter(([, value]) => value !== undefined)
  );
  const result = (await deps.send(deps.socket, {
    cmd: "look",
    ...update,
  })) as LookRow;
  const sleep =
    result.sleepAfterMinutes === 0
      ? "never sleeps"
      : `sleeps after ${result.sleepAfterMinutes} min`;
  ctx.out.write(
    `${result.name}  ${result.colour}  ${result.motion} motion  volume ${result.volume}%  ${sleep}\n` +
      `${result.greeting ? JSON.stringify(result.greeting) : "(no greeting)"}\n`
  );
  if (Object.keys(update).length === 0) return;
  ctx.out.write(
    `${
      result.connected === 0
        ? "No charm is unlocked right now: it gets the look when it unlocks."
        : `Sent to ${result.connected} charm${result.connected === 1 ? "" : "s"}.`
    } It lasts until charmd restarts; to keep it, set "charm" in opencharm.json.\n`
  );
}

// `opencharm new [charm]`: a new conversation with the agent (spec 003), for one charm or all of them.
async function newConversation(
  ctx: CliContext,
  args: readonly string[],
  deps: AdminDeps
): Promise<void> {
  const [charm, extra] = positionals(args);
  if (extra !== undefined) {
    fail(ctx, NEW_USAGE);
    return;
  }
  const answer = newConversationAnswer.safeParse(
    await deps.send(deps.socket, {
      cmd: "newConversation",
      ...(charm ? { charm } : {}),
    })
  );
  if (!answer.success) {
    fail(
      ctx,
      "Unexpected answer from charmd: is it the same version as this CLI?"
    );
    return;
  }
  const { charms } = answer.data;
  ctx.out.write(
    charms.length === 0
      ? "No charms paired yet: nothing to start over.\n"
      : `New conversation for ${charms.join(", ")}: the next thing you say starts fresh (a reply in progress finishes first).\n`
  );
}

function printStatus(
  ctx: CliContext,
  charms: CharmRow[],
  charmd: string | undefined,
  starter: string | undefined,
  voice?: string
): void {
  // What's running, for bug reports (spec 015).
  if (charmd) ctx.out.write(`charmd ${charmd}\n`);
  if (voice) ctx.out.write(`voice ${voice}\n`);
  if (starter) ctx.out.write(`workspace from starter ${starter}\n`);
  if (charms.length === 0) {
    ctx.out.write(
      "No charms paired yet. Start one and run: opencharm pair <code>\n"
    );
    return;
  }
  for (const charm of charms) {
    const note = charm.blocked
      ? "blocked (opencharm unlock to clear)"
      : charm.failedTries > 0
        ? `${charm.failedTries} wrong PIN(s)`
        : "";
    const build = charm.build
      ? `${charm.build.kind} ${charm.build.version} (${charm.build.commit})`
      : "";
    const battery = charm.battery
      ? `${charm.battery.percent}%` +
        (charm.battery.charging
          ? " charging"
          : charm.battery.usb
            ? " on USB"
            : "")
      : "";
    const details = [note, battery, build].filter(Boolean).join("  ");
    ctx.out.write(
      `${charm.name.padEnd(16)} ${charm.state.padEnd(10)} ${details}`.trimEnd() +
        "\n"
    );
  }
}

async function runAdminCommand(
  ctx: CliContext,
  command: string,
  args: readonly string[],
  deps: AdminDeps
): Promise<void> {
  try {
    if (command === "pair") {
      await pair(ctx, args, deps);
      return;
    }
    if (command === "dev") {
      await dev(ctx, args, deps);
      return;
    }
    if (command === "look") {
      await look(ctx, args, deps);
      return;
    }
    if (command === "replies") {
      // The desktop charm speaks its replies, or shows them as text (spec 003); a board always speaks.
      const choice = firstPositional(args);
      if (choice !== "on" && choice !== "off") {
        fail(
          ctx,
          "Usage: opencharm replies on|off   (spoken, or text on the desktop charm)"
        );
        return;
      }
      await deps.send(deps.socket, { cmd: "replies", speak: choice === "on" });
      ctx.out.write(
        choice === "on"
          ? "Replies are spoken, from the next one.\n"
          : "Replies show as text on the desktop charm, from the next one (a charm on a board still speaks).\n"
      );
      return;
    }
    if (command === "new") {
      await newConversation(ctx, args, deps);
      return;
    }
    if (command === "status") {
      const answer = statusSchema.safeParse(
        await deps.send(deps.socket, { cmd: "status" })
      );
      if (!answer.success) {
        fail(
          ctx,
          "Unexpected answer from charmd: is it the same version as this CLI?"
        );
        return;
      }
      const { charms, charmd, starter, voice } = answer.data;
      printStatus(ctx, charms, charmd, starter, voice);
      return;
    }
    const charm = firstPositional(args);
    if (!charm) {
      fail(
        ctx,
        `Usage: opencharm ${command} <charm>   (see: opencharm status)`
      );
      return;
    }
    const { connected } = (await deps.send(deps.socket, {
      cmd: command,
      charm,
    })) as { connected: number };
    ctx.out.write(
      `${DONE[command] ?? "Done"}: ${charm}${connected === 0 ? " (not connected right now)" : ""}.\n`
    );
  } catch (error) {
    fail(ctx, error instanceof Error ? error.message : String(error));
  }
}

export { runAdminCommand };
export type { AdminDeps };
