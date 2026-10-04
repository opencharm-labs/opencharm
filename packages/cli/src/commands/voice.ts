import {
  MODELS,
  installModel,
  modelState,
  type ModelId,
} from "@opencharm-labs/charmd/models";

import { firstPositional } from "../args";
import type { CliContext } from "../context";

type VoiceDeps = { install?: typeof installModel; state?: typeof modelState };

const IDS = Object.keys(MODELS) as ModelId[];

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

// The local voice's models (spec 003): charmd downloads them on its first start; this shows them,
// and installs them ahead of time (`opencharm voice install`), e.g. before going offline.
async function runVoice(
  ctx: CliContext,
  args: readonly string[],
  deps: VoiceDeps = {}
): Promise<void> {
  const install = deps.install ?? installModel;
  const state = deps.state ?? modelState;
  const action = firstPositional(args) ?? "";
  if (action !== "" && action !== "install") {
    ctx.err.write(
      `Unknown voice command "${action}". Try: opencharm voice install\n`
    );
    process.exitCode = 1;
    return;
  }
  for (const id of IDS) {
    const model = MODELS[id];
    if (action === "") {
      const ready = state(id).state === "ready";
      ctx.out.write(
        `${model.label}: ${ready ? "installed" : `not downloaded yet (${megabytes(model.bytes)})`}\n`
      );
      continue;
    }
    let shown = -1;
    try {
      await install(id, {
        onProgress: (received, total) => {
          const percent = Math.floor((received * 100) / (total || model.bytes));
          if (percent >= shown + 10) {
            shown = percent - (percent % 10);
            ctx.out.write(`${model.label}: ${shown}%\n`);
          }
        },
      });
      ctx.out.write(`${model.label}: installed\n`);
    } catch (error) {
      ctx.err.write(
        `${error instanceof Error ? error.message : String(error)}\n`
      );
      process.exitCode = 1;
      return;
    }
  }
}

export { runVoice };
