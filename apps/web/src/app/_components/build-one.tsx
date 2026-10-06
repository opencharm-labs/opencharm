import { cn } from "@/lib/utils";

import { Box } from "./box";
import { Section, SectionHead, SectionIntro } from "./section";
import { BodyText, Note } from "./text";

const STEPS = [
  {
    n: "01",
    time: "5 MIN",
    t: "Buy the board",
    d: "Waveshare ESP32-S3-Touch-AMOLED-2.16, the version with a battery.",
  },
  {
    n: "02",
    time: "5 MIN",
    t: "Use it first, then flash",
    d: "The charm runs today on your computer as the desktop charm. Flashing the board comes with the device port; Waveshare’s factory firmware can always be restored.",
  },
  {
    n: "03",
    time: "5 MIN",
    t: "Pair with your agent",
    d: "opencharm init, then opencharm serve next to Claude Code, Codex, Hermes or another agent, and say hi.",
  },
  {
    n: "04",
    time: "OPTIONAL",
    t: "Print your shell",
    d: "Three parts in your colour, no supports, strap from the seam.",
    solid: true,
  },
];

const BOM = [
  {
    n: "01",
    part: "BOARD",
    what: "Waveshare ESP32-S3-Touch-AMOLED-2.16, with battery. 2.16″ 480 × 480 AMOLED, ESP32-S3, two mics, 46 × 46 × 22.5 mm case",
    price: "$31.99",
  },
  { n: "02", part: "CABLE", what: "USB-C that carries data", price: "—" },
  {
    n: "03",
    part: "SHELL",
    what: "Optional: about 14 cm³ of matte PLA in your colour, a little of a contrast colour for the key",
    price: "~ $1",
  },
  {
    n: "04",
    part: "STRAP",
    what: "Optional: any thin phone-charm strap",
    price: "~ $2",
  },
];

// A parts list: number, part, what, price. On phones the number goes and the part heads its row.
const BOM_ROW = cn(
  "grid grid-cols-[minmax(0,1fr)_80px] gap-3 border-b border-dashed border-rule py-3 *:last:text-right *:last:font-semibold max-sm:*:first:hidden max-sm:*:nth-2:col-span-full sm:grid-cols-[40px_110px_minmax(0,1fr)_90px]"
);

function BuildOne() {
  return (
    <Section id="build">
      <SectionHead ix="10" label="BUILD ONE" />
      <SectionIntro title="One board, one evening.">
        The hardware is a ready-made board that already has the screen,
        microphones, speaker amp, battery and a case. OpenCharm goes onto it
        once the device port is done; until then it runs on your computer as the
        desktop charm. Printing your own shell is optional.
      </SectionIntro>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => (
          <Box
            key={s.n}
            tone={s.solid ? "solid" : "paper"}
            className="flex flex-col gap-2 px-5.5 py-5"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[26px] font-medium">{s.n}</span>
              <Note asChild>
                <span>{s.time}</span>
              </Note>
            </div>
            <h3 className="text-[19px] font-semibold">{s.t}</h3>
            <BodyText>{s.d}</BodyText>
          </Box>
        ))}
      </div>
      <div className="border-t-[1.5px] border-ink font-mono text-[13px]/[1.5]">
        {BOM.map((b) => (
          <div key={b.n} className={cn(BOM_ROW, "*:nth-[-n+2]:text-mute")}>
            <span>{b.n}</span>
            <span>{b.part}</span>
            <span>{b.what}</span>
            <span>{b.price}</span>
          </div>
        ))}
        <div className={cn(BOM_ROW, "*:font-semibold")}>
          <span />
          <span>TOTAL</span>
          <span>The board alone, or with a printed shell and a strap</span>
          <span>$32–35</span>
        </div>
      </div>
    </Section>
  );
}

export { BuildOne };
