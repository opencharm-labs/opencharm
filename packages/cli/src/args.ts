type ParsedArgs = {
  command: string;
  rest: string[];
  help: boolean;
  version: boolean;
};

const VALUE_FLAGS = new Set([
  "--colour",
  "--color",
  "--config",
  "--agent",
  "--from",
  "--socket",
  "--name",
  "--url",
  "--port",
  "--greeting",
  "--motion",
]);

function isPositional(args: readonly string[], index: number): boolean {
  const word = args[index];
  const previous = index > 0 ? args[index - 1] : undefined;
  return (
    word !== undefined &&
    !word.startsWith("-") &&
    !(previous !== undefined && VALUE_FLAGS.has(previous))
  );
}

function firstPositional(args: readonly string[]): string | undefined {
  const index = args.findIndex((_, i) => isPositional(args, i));
  return index >= 0 ? args[index] : undefined;
}

function flagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const at = argv.findIndex((_, i) => isPositional(argv, i));
  return {
    command: at >= 0 ? (argv[at] ?? "").toLowerCase() : "",
    rest: at >= 0 ? [...argv.slice(0, at), ...argv.slice(at + 1)] : [...argv],
    help: argv.includes("-h") || argv.includes("--help"),
    version: argv.includes("-v") || argv.includes("--version"),
  };
}

export { VALUE_FLAGS, firstPositional, flagValue, parseArgs };
export type { ParsedArgs };
