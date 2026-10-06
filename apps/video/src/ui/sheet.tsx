import type { CSSProperties, ReactNode } from "react";
import { MONO } from "../fonts";
import { out, span } from "../motion";

// opencharm.dev's drawing paper: a 160 px grid over a 20 px one, on paper (globals.css, body).
export const PAPER: CSSProperties = {
  backgroundColor: "#F6F6F4",
  backgroundImage:
    "linear-gradient(rgb(10 10 10 / 0.07) 1px, transparent 1px)," +
    "linear-gradient(90deg, rgb(10 10 10 / 0.07) 1px, transparent 1px)," +
    "linear-gradient(rgb(10 10 10 / 0.03) 1px, transparent 1px)," +
    "linear-gradient(90deg, rgb(10 10 10 / 0.03) 1px, transparent 1px)",
  backgroundSize: "160px 160px, 160px 160px, 20px 20px, 20px 20px",
  backgroundPosition: "-1px -1px",
};

export function Paper({ style }: { style?: CSSProperties }) {
  return <div style={{ position: "absolute", inset: 0, ...PAPER, ...style }} />;
}

const LEFT = 46;
const RIGHT = 1840;
const TOP = 46;
const X0 = 200;
const X1 = 1720;

function Ticks({
  draw,
  ink,
  shift,
}: {
  draw: number;
  ink: string;
  shift: number;
}) {
  const left: ReactNode[] = [];
  for (let y = -100 + (((shift % 100) + 100) % 100); y < 1080; y += 20) {
    const major = Math.round(y - shift) % 100 === 0;
    left.push(
      <line
        key={`l${y}`}
        x1={LEFT - (major ? 16 : 8)}
        x2={LEFT}
        y1={y}
        y2={y}
        stroke={ink}
        strokeOpacity={major ? 0.9 : 0.4}
      />
    );
  }
  const top: ReactNode[] = [];
  for (let x = X0; x <= X1; x += 20) {
    const major = (x - X0) % 100 === 0;
    top.push(
      <line
        key={`t${x}`}
        x1={x}
        x2={x}
        y1={TOP}
        y2={TOP - (major ? 12 : 6)}
        stroke={ink}
        strokeOpacity={major ? 0.9 : 0.4}
      />
    );
  }
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <pattern
          id="hatch"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="10"
            stroke={ink}
            strokeOpacity="0.16"
          />
        </pattern>
        <clipPath id="draw">
          <rect x={0} y={0} width={1920 * draw} height={1080} />
        </clipPath>
      </defs>
      <g clipPath="url(#draw)">
        <line
          x1={LEFT}
          x2={LEFT}
          y1={0}
          y2={1080}
          stroke={ink}
          strokeOpacity={0.35}
        />
        {left}
        <line
          x1={X0}
          x2={X1}
          y1={TOP}
          y2={TOP}
          stroke={ink}
          strokeOpacity={0.9}
        />
        {top}
        <rect
          x={RIGHT}
          y={0}
          width={1920 - RIGHT}
          height={1080}
          fill="url(#hatch)"
        />
        <line
          x1={RIGHT}
          x2={RIGHT}
          y1={0}
          y2={1080}
          stroke={ink}
          strokeOpacity={0.35}
        />
      </g>
    </svg>
  );
}

const label = (ink: string): CSSProperties => ({
  position: "absolute",
  top: 16,
  font: `400 15px/1 ${MONO}`,
  letterSpacing: "0.14em",
  color: ink,
  opacity: 0.75,
  whiteSpace: "pre",
});

// The drawing sheet around every shot, as on opencharm.dev: the graduated ruler on the left, a ruler
// with the title block along the top, and the hatched band on the right. The left ruler reads the
// camera (shift), so it measures the scene as it moves.
export function Sheet({
  frame,
  from,
  title,
  shift = 0,
  night = false,
  labels = true,
}: {
  frame: number;
  from: number;
  title: string;
  shift?: number;
  night?: boolean;
  labels?: boolean;
}) {
  const ink = night ? "#EDEDED" : "#0A0A0A";
  const draw = span(frame, from, from + 40, out);
  const seconds = frame / 60;
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <Ticks draw={draw} ink={ink} shift={shift} />
      {labels && (
        <div style={{ opacity: span(frame, from + 10, from + 30) }}>
          <div style={{ ...label(ink), left: X0 }}>
            DWG OC-002 · FILM · REV 1.0
          </div>
          <div
            style={{ ...label(ink), left: 0, right: 0, textAlign: "center" }}
          >
            {title}
          </div>
          <div
            style={{ ...label(ink), right: 1920 - X1 }}
          >{`T ${time} · 60 FPS`}</div>
        </div>
      )}
    </div>
  );
}

// A note on the drawing: a leader from the label to what it names, drawn on like ink.
export function Leader({
  p,
  from,
  to,
  title,
  note,
  align = "right",
  ink = "#0A0A0A",
}: {
  p: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  title: string;
  note?: string;
  align?: "left" | "right";
  ink?: string;
}) {
  if (p <= 0) return null;
  const elbow = { x: from.x + (align === "right" ? 36 : -36), y: from.y };
  const line = Math.min(1, p * 1.6);
  const mid = {
    x: elbow.x + (to.x - elbow.x) * Math.max(0, line * 2 - 1),
    y: elbow.y + (to.y - elbow.y) * Math.max(0, line * 2 - 1),
  };
  const first = {
    x: from.x + (elbow.x - from.x) * Math.min(1, line * 2),
    y: from.y,
  };
  return (
    <>
      <svg
        width={1920}
        height={1080}
        style={{ position: "absolute", inset: 0 }}
      >
        <polyline
          points={`${from.x},${from.y} ${first.x},${first.y} ${line > 0.5 ? `${mid.x},${mid.y}` : ""}`}
          fill="none"
          stroke={ink}
          strokeWidth={1.5}
        />
        {line >= 1 && <circle cx={to.x} cy={to.y} r={4} fill={ink} />}
      </svg>
      <div
        style={{
          position: "absolute",
          top: from.y - 10,
          ...(align === "right"
            ? { right: 1920 - from.x + 14, textAlign: "right" as const }
            : { left: from.x + 14 }),
          opacity: span(p, 0.3, 0.8),
        }}
      >
        <div
          style={{
            font: `600 22px/1 ${MONO}`,
            letterSpacing: "0.14em",
            color: ink,
          }}
        >
          {title}
        </div>
        {note && (
          <div
            style={{
              marginTop: 10,
              font: `400 17px/1 ${MONO}`,
              letterSpacing: "0.14em",
              color: ink,
              opacity: 0.55,
            }}
          >
            {note}
          </div>
        )}
      </div>
    </>
  );
}
