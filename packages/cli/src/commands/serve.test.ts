import { describe, expect, it } from "vitest";

import type { CliContext } from "../context";
import { createStyle } from "../terminal";
import { runServe } from "./serve";

describe("opencharm serve", () => {
  it("explains a startup failure in one line instead of crashing", async () => {
    const err: string[] = [];
    const ctx = {
      out: { write: () => true },
      err: { write: (s: string) => err.push(s) },
      style: createStyle({ color: false, trueColor: false }),
    } as unknown as CliContext;
    process.exitCode = 0;
    await runServe(ctx, ["--config", "/nope/opencharm.json"]);
    expect(err.join("")).toMatch(
      /^charmd could not start: Config file not found/
    );
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});
