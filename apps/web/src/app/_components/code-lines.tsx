import { Fragment } from "react";

import { cn } from "@/lib/utils";

type Line = [content: React.ReactNode, colour: string];

// Terminal colours: white, dim, green, yellow.
const W = "text-on-night";
const D = "text-[#7a7a7a]";
const G = "text-[#9be8b8]";
const Y = "text-sun";

// A terminal's text on night: whitespace kept, scrolling sideways on wide screens; on phones long
// lines wrap instead of hiding behind a scroll.
function CodeBlock({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "overflow-x-auto bg-night px-5.5 py-4.5 font-mono text-[12.5px]/[1.75] whitespace-pre text-on-night max-sm:p-4 max-sm:wrap-anywhere max-sm:whitespace-pre-wrap",
        className
      )}
      {...props}
    />
  );
}

function Caret() {
  return (
    <span className="inline-block w-[0.6em] bg-on-night text-transparent motion-safe:animate-caret">
      _
    </span>
  );
}

// One span per line, joined by newlines: the block keeps whitespace.
function CodeLines({ lines }: { lines: Line[] }) {
  return lines.map(([content, colour], i) => (
    <Fragment key={i}>
      {i > 0 ? "\n" : null}
      <span className={colour}>{content}</span>
    </Fragment>
  ));
}

export { Caret, CodeBlock, CodeLines, D, G, W, Y };
export type { Line };
