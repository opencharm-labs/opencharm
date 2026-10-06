import { Button } from "@/components/ui/button";

import { Actions } from "./actions";
import { HeroStage } from "./hero-stage";

const SPECS = [
  { i: "S.01", value: "46.8", unit: "MM", note: "SQUARE FRONT, 22 MM DEEP" },
  { i: "S.02", value: "1", unit: "KEY", note: "HOLD, PRESS, TAP THE FACE" },
  { i: "S.03", value: "22", unit: "MOODS", note: "13 AGENT STATES" },
  { i: "S.04", value: "1", unit: "AGENT", note: "THE ONE YOU ALREADY USE" },
  { i: "S.05", value: "0", unit: "API KEYS", note: "STORED ON THE DEVICE" },
  { i: "S.06", value: "~$32", unit: "", note: "OF HARDWARE" },
];

const FACTS = [
  "ONE AGENT AT A TIME",
  "ONE KEY",
  "A FACE YOU CAN TYPE",
  "MIC ONLY WHILE HELD",
];

function Hero() {
  return (
    // The headline and the way in on top, then the scene, big, straight on the paper.
    <header className="flex flex-col gap-12 pt-9 pb-9 lg:pt-14">
      <div className="flex flex-col items-center gap-5.5 text-center lg:gap-6.5">
        <h1 className="text-[length:clamp(2.75rem,5.6vw,5.25rem)]/[0.92] font-semibold tracking-[-0.05em]">
          Meet your agentic companion
        </h1>
        <div className="flex flex-col items-center gap-5.5">
          {/* One line on a desktop: the drawing below says the rest. */}
          <p className="max-w-[920px] text-[length:clamp(1.125rem,1.6vw,1.375rem)]/[1.55] text-ink-2">
            A tiny charm that gives the agent you already run a face, a voice
            and one key
          </p>
          <Actions className="justify-center">
            <Button asChild size="hero">
              <a href="#desktop">Get the desktop charm</a>
            </Button>
            <Button asChild variant="outline" size="hero">
              <a href="#how">How it works</a>
            </Button>
          </Actions>
          <a
            className="-mt-2.5 inline-flex min-h-11 items-center font-mono text-[12px] tracking-label"
            href="#make"
          >
            OR MAKE IT YOURS: COLOUR, NAME, FACE ↓
          </a>
        </div>
      </div>
      <HeroStage />
      <ul className="grid grid-cols-[repeat(2,minmax(0,max-content))] justify-center gap-x-7 gap-y-2 font-mono text-[12px] tracking-label text-ink-2 max-xs:grid-cols-1">
        {FACTS.map((f) => (
          <li key={f} className="before:text-mute before:content-['+_']">
            {f}
          </li>
        ))}
      </ul>
    </header>
  );
}

function KeyNumbers() {
  return (
    <>
      {/* Two columns on phones, three on tablets, one row of six on desktops; rules only between cells. */}
      <ul
        className="mt-2 grid grid-cols-2 border-[1.5px] border-ink bg-card sm:grid-cols-3 lg:grid-cols-6"
        aria-label="Key numbers"
      >
        {SPECS.map((s) => (
          <li
            key={s.i}
            className="flex min-w-0 flex-col gap-1 border-r border-rule px-4 pt-4 pb-3.5 max-sm:border-b max-sm:even:border-r-0 sm:max-lg:nth-[-n+3]:border-b sm:max-lg:nth-[3n]:border-r-0 lg:last:border-r-0"
          >
            <i className="font-mono text-4xs tracking-label text-mute not-italic">
              {s.i}
            </i>
            <b className="text-[length:clamp(1.5rem,2.6vw,2.125rem)]/[1.05] font-semibold tracking-[-0.03em] whitespace-nowrap tabular-nums">
              {s.value}
              {s.unit ? (
                <small className="ml-0.75 font-mono text-[0.45em] font-medium tracking-[0.06em]">
                  {s.unit}
                </small>
              ) : null}
            </b>
            <span className="font-mono text-3xs/[1.4] tracking-widest text-ink-2">
              {s.note}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-7 flex flex-wrap justify-between gap-x-7.5 gap-y-2.5 border-y-[1.5px] border-ink py-4 font-mono text-[12px] tracking-label *:first:text-mute">
        <span>WORKS WITH</span>
        <span>CLAUDE CODE</span>
        <span>CODEX</span>
        <span>HERMES AGENT</span>
        <span>OPENCLAW</span>
        <span>ANY ACP AGENT</span>
      </p>
    </>
  );
}

export { Hero, KeyNumbers };
