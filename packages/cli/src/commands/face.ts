import { facesData } from "@opencharm-labs/design/faces";

import { animateFace } from "../animate";
import { firstPositional } from "../args";
import type { CliContext } from "../context";
import { faceText, findFace, pickColour, randomFace } from "../face-lookup";

const FACE_MS = 2200;

async function runFace(
  ctx: CliContext,
  args: readonly string[]
): Promise<void> {
  const colour = pickColour(args, (message) => ctx.err.write(`${message}\n`));
  const id = firstPositional(args);
  const face = id ? findFace(id) : randomFace();
  if (!face) {
    ctx.out.write(
      `No mood called "${id ?? ""}". Try: ${facesData.faces.map((f) => f.id).join(", ")}\n`
    );
    process.exitCode = 1;
    return;
  }
  ctx.out.write("\n");
  await animateFace(face, colour, { ...ctx, durationMs: FACE_MS });
  ctx.out.write(
    `\n  ${ctx.style.bold(face.t)}  ${ctx.style.dim(faceText(face))}\n\n`
  );
}

export { runFace };
