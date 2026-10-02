import { facesData } from "@opencharm-labs/design/faces";

import type { CliContext } from "../context";
import { faceText, findFace, pickColour } from "../face-lookup";

function runStates(ctx: CliContext, args: readonly string[]): void {
  const { fg, bg, bold, dim, reset } = ctx.style;
  const colour = pickColour(args, (message) => ctx.err.write(`${message}\n`));
  ctx.out.write(`\n  ${bold("What your agent is doing → the face")}\n\n`);
  for (const state of facesData.states) {
    const face = findFace(state.face);
    const text = (face ? faceText(face) : state.face).padEnd(7);
    const ink = state.face === "ask" ? ctx.signal : colour.g;
    ctx.out.write(
      `  ${fg(ink)}${bg("#000000")} ${bold(text)} ${reset}  ${bold(state.name.padEnd(10))} ${state.when}\n  ${" ".repeat(12)}${dim(`trigger: ${state.trigger}`)}\n`
    );
  }
  ctx.out.write(`\n  ${dim("Orange means one thing only: it needs you.")}\n\n`);
}

export { runStates };
