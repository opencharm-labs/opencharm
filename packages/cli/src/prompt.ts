import { createInterface } from "node:readline";

// One reader for the whole process: piped input often arrives in a single chunk, and a reader per
// prompt would swallow the lines meant for the next one.
function createLineQueue(input: NodeJS.ReadableStream): () => Promise<string> {
  const lines: string[] = [];
  const waiting: Array<(line: string) => void> = [];
  let ended = false;
  const rl = createInterface({ input, terminal: false });
  rl.on("line", (line) => {
    const waiter = waiting.shift();
    if (waiter) waiter(line.trim());
    else lines.push(line.trim());
  });
  rl.on("close", () => {
    ended = true;
    for (const waiter of waiting.splice(0)) waiter("");
  });
  return () => {
    const line = lines.shift();
    if (line !== undefined) return Promise.resolve(line);
    if (ended) return Promise.resolve("");
    return new Promise((resolve) => waiting.push(resolve));
  };
}

let pipedLines: (() => Promise<string>) | undefined;

// PINs are typed without echo on a terminal; piped input (scripts, tests) is read line by line.
function promptHidden(question: string): Promise<string> {
  const input = process.stdin;
  const output = process.stderr;
  if (!input.isTTY) {
    pipedLines ??= createLineQueue(input);
    output.write(question);
    return pipedLines().then((line) => {
      output.write("\n");
      return line;
    });
  }
  return new Promise((resolve) => {
    let value = "";
    output.write(question);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          output.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          input.setRawMode(false);
          process.exit(130);
        }
        if (char === "\u007f") value = value.slice(0, -1);
        else value += char;
      }
    };
    input.on("data", onData);
  });
}

export { createLineQueue, promptHidden };
