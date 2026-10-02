import { cn } from "@/lib/utils";

const CELLS = [
  { k: "DWG NO", v: "OC-001" },
  { k: "REV", v: "0.1" },
  { k: "DATE", v: "2026-09-29" },
  { k: "SHEET", v: "1 / 1" },
  { k: "WEB", v: "opencharm.dev" },
  { k: "GITHUB", v: "opencharm-labs" },
  { k: "SOFTWARE", v: "MIT" },
  { k: "HARDWARE", v: "CERN-OHL-S" },
];

// Two columns on phones; on wider screens the project cell spans two rows beside four columns.
const CELL = cn(
  "flex min-w-0 flex-col gap-0.75 border-r border-b border-rule px-3.5 py-3 max-md:odd:border-r-0"
);
const LABEL = cn("font-mono text-4xs tracking-[0.16em] text-mute");
const VALUE = cn(
  "font-mono text-[13px] font-semibold tracking-[0.04em] wrap-anywhere"
);
const ASIDE = cn("text-[13px] text-ink-2 not-italic");

// The footer is the drawing's title block; its note carries the truths every page keeps.
function TitleBlock() {
  return (
    <footer
      className="mt-10 grid grid-cols-2 border-[1.5px] border-ink bg-card md:grid-cols-[2.2fr_repeat(4,1fr)]"
      aria-label="Project details"
    >
      <div className={cn(CELL, "max-md:col-span-full md:row-span-2")}>
        <span className={LABEL}>PROJECT</span>
        <b className="text-[24px] font-semibold tracking-[-0.02em]">
          OpenCharm
        </b>
        <em className={ASIDE}>
          Your agentic companion. Open source, down to the case files.
        </em>
      </div>
      {CELLS.map((c) => (
        <div
          key={c.k}
          className={cn(CELL, "md:nth-5:border-r-0 md:nth-9:border-r-0")}
        >
          <span className={LABEL}>{c.k}</span>
          <b className={VALUE}>{c.v}</b>
        </div>
      ))}
      <div className={cn(CELL, "col-span-full border-r-0 border-b-0")}>
        <span className={LABEL}>NOTE</span>
        <em className={ASIDE}>
          Open source, provided as is, with no warranty: you build and use it at
          your own risk. We sell nothing: there is nothing to order. Not
          affiliated with Meta, Anthropic, OpenAI, Google, Nous Research,
          OpenClaw, Waveshare or Espressif. Page views are counted by Vercel Web
          Analytics, with no cookies.
        </em>
      </div>
    </footer>
  );
}

export { TitleBlock };
