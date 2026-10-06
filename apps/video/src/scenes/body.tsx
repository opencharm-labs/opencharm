import { useCurrentFrame } from "remotion";
import { Charm3D, type CharmPose, PX_PER_MM } from "../charm/charm-3d";
import { type ColourId, colour, face } from "../charm/engine";
import { MONO, SANS } from "../fonts";
import { keys, out, rand, snap, span, step } from "../motion";
import { FPS, beat } from "../track";
import { Kinetic, wordsFrom } from "../ui/kinetic";
import { Morph, FULL_FRAME } from "../ui/morph";
import { AGENT_EYES } from "./notch-story";

// The window (41.7 mm) and the screen's active area (38.99 mm) seen straight on, in pixels.
const WINDOW = 41.7 * PX_PER_MM;
const ACTIVE = 38.99 * PX_PER_MM;
const SHELL = 46.8 * PX_PER_MM;
const INK = "#0A0A0A";
const LINE = "#A3A3A3";

function Paper() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#F6F6F4",
        backgroundImage:
          "linear-gradient(rgba(10,10,10,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(10,10,10,0.05) 1px, transparent 1px)," +
          "linear-gradient(rgba(10,10,10,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(10,10,10,0.08) 1px, transparent 1px)",
        backgroundSize: "20px 20px, 20px 20px, 160px 160px, 160px 160px",
        backgroundPosition: "0 0, 0 0, 0 0, 0 0",
      }}
    />
  );
}

// A dimension line drawn on like ink: ticks at both ends, the label in the middle.
function Dimension({
  p,
  x1,
  y1,
  x2,
  y2,
  label,
  vertical,
}: {
  p: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  vertical?: boolean;
}) {
  if (p <= 0) return null;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const tick = 14;
  return (
    <>
      <svg
        style={{ position: "absolute", inset: 0 }}
        width={1920}
        height={1080}
      >
        <line
          x1={mx - (mx - x1) * p}
          y1={my - (my - y1) * p}
          x2={mx + (x2 - mx) * p}
          y2={my + (y2 - my) * p}
          stroke={LINE}
          strokeWidth={1.5}
        />
        {vertical ? (
          <>
            <line
              x1={x1 - tick}
              x2={x1 + tick}
              y1={y1}
              y2={y1}
              stroke={LINE}
              strokeWidth={1.5}
              opacity={p}
            />
            <line
              x1={x2 - tick}
              x2={x2 + tick}
              y1={y2}
              y2={y2}
              stroke={LINE}
              strokeWidth={1.5}
              opacity={p}
            />
          </>
        ) : (
          <>
            <line
              x1={x1}
              x2={x1}
              y1={y1 - tick}
              y2={y1 + tick}
              stroke={LINE}
              strokeWidth={1.5}
              opacity={p}
            />
            <line
              x1={x2}
              x2={x2}
              y1={y2 - tick}
              y2={y2 + tick}
              stroke={LINE}
              strokeWidth={1.5}
              opacity={p}
            />
          </>
        )}
      </svg>
      <div
        style={{
          position: "absolute",
          left: vertical ? mx + 26 : mx - 200,
          top: vertical ? my - 12 : my - 44,
          width: vertical ? 300 : 400,
          textAlign: vertical ? "left" : "center",
          font: `500 20px/1 ${MONO}`,
          letterSpacing: "0.14em",
          color: "#6E6E6E",
          opacity: span(p, 0.5, 1),
        }}
      >
        {label}
      </div>
    </>
  );
}

const SWAPS: [number, ColourId, string][] = [
  [70, "white", "happy"],
  [72, "cobalt", "wink"],
  [73, "lime", "loved"],
  [74, "lilac", "joy"],
  [75, "sun", "cute"],
  [76, "coal", "happy"],
  [77, "white", "happy"],
  [79, "white", "wink"],
  [79.6, "white", "happy"],
];

// Starts at beat 68: the face leaves the screen for a body you print, then the address.
export function Body() {
  const frame = useCurrentFrame();
  const B = (n: number) => beat(n) - beat(68);
  const handoff = span(frame, 0, B(70), snap);
  const [, colourId, faceId] = step(
    frame,
    SWAPS.map((s) => [B(s[0]), s] as [number, (typeof SWAPS)[number]])
  );
  const c = colour(colourId);
  const f = face(faceId);
  const turn = keys(frame, [
    [B(71.75), 0],
    [B(76), Math.PI * 2 - 0.42],
    [B(77.5), Math.PI * 2 - 0.35],
  ]);
  const lift = keys(
    frame,
    [
      [B(76), 0],
      [B(77.5), 1],
    ],
    snap
  );
  const sinceSwap =
    frame -
    B(
      step(
        frame,
        SWAPS.map((s) => [B(s[0]), s[0]] as [number, number])
      )
    );
  const pop =
    frame < B(72)
      ? 1
      : 1 - 0.18 * Math.exp(-sinceSwap / 5) * Math.cos(sinceSwap / 2.4);
  const ms = (frame / FPS) * 1000;
  const blink = frame > B(80) && (frame - B(80)) % 170 < 7;
  const glance = Math.floor(frame / 80);

  const pose: CharmPose = {
    rotY: turn,
    rotX: 0.08 * lift + Math.sin(turn) * 0.05,
    y: 9 * lift,
    scale: 1 - 0.28 * lift,
    colour: c,
    glyphs: {
      face: f,
      colour: c,
      blink,
      pop,
      look:
        frame > B(77.5)
          ? {
              x: (rand(glance) * 2 - 1) * 0.6,
              y: (rand(glance + 7) * 2 - 1) * 0.4,
            }
          : { x: 0, y: 0 },
      cursorOn: Math.floor(ms / 500) % 2 === 0,
      t: ms,
    },
  };

  const dims =
    span(frame, B(70), B(71.25), out) - span(frame, B(71.75), B(72.25));
  const half = SHELL / 2;
  const top = 540 - half;
  const window = {
    x: 960 - WINDOW / 2,
    y: 540 - WINDOW / 2,
    w: WINDOW,
    h: WINDOW,
    r: 3.9 * PX_PER_MM,
  };
  const eyesTo = {
    lx: 960 - ACTIVE * 0.215,
    ly: 540 - ACTIVE / 2 + ACTIVE * 0.46,
    rx: 960 + ACTIVE * 0.215,
    ry: 540 - ACTIVE / 2 + ACTIVE * 0.46,
    size: ACTIVE * 0.34,
  };
  const shadow = 1 - lift * 0.3;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Paper />
      <div
        style={{
          position: "absolute",
          left: 960 - 300 * shadow,
          top: 540 + half * (1 - 0.28 * lift) - lift * 9 * PX_PER_MM + 30,
          width: 600 * shadow,
          height: 60,
          borderRadius: "50%",
          background:
            "radial-gradient(closest-side, rgba(10,10,10,0.16), rgba(10,10,10,0))",
          opacity: span(frame, B(69), B(70)),
        }}
      />
      <Charm3D pose={pose} />
      <Dimension
        p={dims}
        x1={960 - half}
        y1={top - 56}
        x2={960 + half}
        y2={top - 56}
        label="46.8 MM"
      />
      <Dimension
        p={dims}
        x1={960 + half + 56}
        y1={top}
        x2={960 + half + 56}
        y2={top + SHELL}
        label="46.8 MM"
        vertical
      />
      <Dimension
        p={dims}
        x1={960 - half - 56}
        y1={540 - ACTIVE / 2}
        x2={960 - half - 56}
        y2={540 + ACTIVE / 2}
        label=""
        vertical
      />
      <div
        style={{
          position: "absolute",
          left: 960 - half - 56 - 330,
          top: 528,
          width: 300,
          textAlign: "right",
          font: `500 20px/1 ${MONO}`,
          letterSpacing: "0.14em",
          color: "#6E6E6E",
          opacity: Math.max(0, dims),
        }}
      >
        480 × 480 AMOLED
      </div>

      <Kinetic
        frame={frame}
        words={wordsFrom("Next: a body you can hold.", B(70.5), 6)}
        leave={B(76)}
        size={76}
        align="center"
        style={{ left: 0, right: 0, top: 850 }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 960,
          textAlign: "center",
          font: `500 20px/1 ${MONO}`,
          letterSpacing: "0.14em",
          color: "#6E6E6E",
          opacity: span(frame, B(72), B(72.5)) - span(frame, B(76), B(76.25)),
        }}
      >
        OPEN HARDWARE · PRINT YOUR OWN
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 790,
          textAlign: "center",
          font: `600 120px/1 ${SANS}`,
          letterSpacing: "-0.05em",
          color: INK,
          opacity: span(frame, B(77), B(77) + 10),
          transform: `translateY(${(1 - span(frame, B(77), B(77) + 18, out)) * 36}px)`,
        }}
      >
        opencharm.dev
      </div>

      {frame < B(70) && (
        <Morph
          p={handoff}
          from={FULL_FRAME}
          to={window}
          eyesFrom={AGENT_EYES}
          eyesTo={eyesTo}
          face={face("happy")}
          colour={colour("white")}
        />
      )}
    </div>
  );
}
