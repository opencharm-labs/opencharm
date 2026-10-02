import type { CliContext } from "../context";
import { LINKS } from "../links";

function runHardware(ctx: CliContext): void {
  const { bold, dim } = ctx.style;
  ctx.out.write(`
  ${bold("What you need")}

  1. Waveshare ESP32-S3-Touch-AMOLED-2.16, the version with a battery
     2.16" 480×480 AMOLED, two mics, speaker amp, battery, case.
     $31.99 at Waveshare's store in September 2026 (check the store; shipping extra).
     ${LINKS.board}
  2. A small speaker, 8 ohm 1-2 W with a 2-pin lead (not in the box).
  3. A USB-C cable that carries data.
  4. Optional: print your own shell (3 parts, no supports, strap from the seam).
     STL files: ${LINKS.repo}/tree/main/hardware/stl/print

  ${dim(`Firmware and charmd are in development. Follow along at ${LINKS.site}`)}
`);
}

export { runHardware };
