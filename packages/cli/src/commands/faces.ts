import { facesData } from "@opencharm-labs/design/faces";

import type { CliContext } from "../context";
import { faceText, pickColour } from "../face-lookup";

function runFaces(ctx: CliContext, args: readonly string[]): void {
  const { fg, bg, bold, dim, reset } = ctx.style;
  const colour = pickColour(args, (message) => ctx.err.write(`${message}\n`));
  ctx.out.write(
    `\n  ${bold("Moods")} ${dim("(two eyes and an optional mouth, typed)")}\n\n`
  );
  for (const face of facesData.faces) {
    const text = faceText(face).padEnd(7);
    ctx.out.write(
      `  ${fg(colour.g)}${bg("#000000")} ${bold(text)} ${reset}  ${face.t.padEnd(10)} ${dim(face.id)}\n`
    );
  }
  ctx.out.write(
    `\n  ${dim("Write your own: two characters for eyes, one for a mouth. Share it as text.")}\n\n`
  );
}

export { runFaces };
