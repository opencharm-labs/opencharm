import { VALUE_FLAGS, firstPositional, flagValue } from "../args";
import type { CliContext } from "../context";

type AdminDeps = {
  socket: string;
  send: (socket: string, request: Record<string, unknown>) => Promise<unknown>;
  prompt: (question: string) => Promise<string>;
};
type CharmRow = {
  name: string;
  state: string;
  blocked: boolean;
  failedTries: number;
  build?: { kind: string; version: string; commit: string };
};
type LookRow = {
  name: string;
  colour: string;
  greeting: string;
  sleepAfterMinutes: number;
  motion: string;
  connected: number;
};

const DONE: Record<string, string> = {
  lock: "Locked",
  unlock: "Unblocked and unlocked",
  revoke: "Revoked",
};

function fail(ctx: CliContext, message: string): void {
  ctx.err.write(`${message}\n`);
  process.exitCode = 1;
}

async function pair(
  ctx: CliContext,
  args: readonly string[],
  deps: AdminDeps
): Promise<void> {
  const code = firstPositional(args);
  if (!code) {
    fail(
      ctx,
      "Usage: opencharm pair <code> [--name <name>]   (the 6-digit code on the charm's screen)"
    );
    return;
  }
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
  "Usage: opencharm dev face <charm> <state> [text]   |   opencharm dev say <charm> <text>   |   opencharm dev ask <charm> <question>";

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
    const [state, ...line] = words;
    await deps.send(deps.socket, {
      cmd: "devFace",
      charm,
      state,
      ...(line.length ? { text: line.join(" ") } : {}),
    });
    ctx.out.write(`Face ${state} sent to ${charm}.\n`);
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
  const flags = {
    colour: flagValue(args, "--colour") ?? flagValue(args, "--color"),
    greeting: flagValue(args, "--greeting"),
    motion: flagValue(args, "--motion"),
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
    `${result.name}  ${result.colour}  ${result.motion} motion  ${sleep}\n` +
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

function printStatus(
  ctx: CliContext,
  charms: CharmRow[],
  charmd: string | undefined,
  starter: string | undefined
): void {
  // What's running, for bug reports (spec 015).
  if (charmd) ctx.out.write(`charmd ${charmd}\n`);
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
    const details = [note, build].filter(Boolean).join("  ");
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
    if (command === "status") {
      const { charms, charmd, starter } = (await deps.send(deps.socket, {
        cmd: "status",
      })) as { charms: CharmRow[]; charmd?: string; starter?: string };
      printStatus(ctx, charms, charmd, starter);
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
