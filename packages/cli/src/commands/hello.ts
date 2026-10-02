import { facesData } from "@opencharm-labs/design/faces";

import { animateFace } from "../animate";
import type { CliContext } from "../context";
import { findFace, pickColour } from "../face-lookup";
import { LINKS } from "../links";

const HELLO_MS = 2600;

async function runHello(
  ctx: CliContext,
  args: readonly string[]
): Promise<void> {
  const colour = pickColour(args, (message) => ctx.err.write(`${message}\n`));
  const face = findFace("happy");
  if (!face) throw new Error('faces.json lost the "happy" face');
  const { bold, dim } = ctx.style;
  ctx.out.write("\n");
  await animateFace(face, colour, { ...ctx, durationMs: HELLO_MS });
  ctx.out.write(`
  ${bold("OpenCharm")} ${dim(`v${ctx.version}`)}
  The open-source charm for your AI agent.

  A small device that becomes the face and voice of the agent you already run
  (Hermes Agent or OpenClaw). A face you can type, one key, about $32 of hardware.

  ${bold("Try")}
    npx opencharm faces          all ${facesData.faces.length} moods
    npx opencharm face learned   one mood, big
    npx opencharm states         what your agent is doing → which face
    npx opencharm hardware       what to buy and print
    npx opencharm serve          start charmd, the charm daemon

  ${bold("Links")}
    ${LINKS.site}
    ${LINKS.repo}
`);
}

export { runHello };
