"use client";

import { useEffect, useRef, useState } from "react";

// A drawing's edge scale, measured to its real width: a tick every 10 px, longer every 50 and 100,
// closed by a full tick exactly at the edge (a CSS pattern would stop wherever the width runs out).
const STEP = 10;
const HEIGHT = 10;
const MIN_GAP = 6;

function tickHeight(x: number): number {
  if (x % 100 === 0) return HEIGHT;
  if (x % 50 === 0) return 6;
  return 3;
}

function DrawingRuler() {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The baseline runs the full width and closes with a full tick at the edge; an interior tick that
  // would sit right against that closing tick is left out, so the end never reads as a double line.
  const end = width - 1;
  const ticks: number[] = [];
  for (let x = 0; x <= end - MIN_GAP; x += STEP) ticks.push(x);

  return (
    <div className="absolute inset-x-0 bottom-0 h-2.5" ref={host}>
      {width > 0 ? (
        <svg
          className="block stroke-dash"
          width={width}
          height={HEIGHT}
          aria-hidden="true"
        >
          <line x1={0} x2={width} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} />
          {ticks.map((x) => (
            <line
              key={x}
              className={x % 100 === 0 ? "stroke-ink" : undefined}
              x1={x + 0.5}
              x2={x + 0.5}
              y1={HEIGHT - tickHeight(x)}
              y2={HEIGHT}
            />
          ))}
          <line
            className="stroke-ink"
            x1={width - 0.5}
            x2={width - 0.5}
            y1={0}
            y2={HEIGHT}
          />
        </svg>
      ) : null}
    </div>
  );
}

export { DrawingRuler };
