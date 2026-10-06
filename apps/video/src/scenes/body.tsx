import { useCurrentFrame } from "remotion";
import { Charm3D, type CharmPose, PX_PER_MM } from "../charm/charm-3d";
import { type ColourId, colour, face } from "../charm/engine";
import { MONO } from "../fonts";
import { keys, out, snap, span, step } from "../motion";
import { FPS, beat } from "../track";
import { Kinetic, wordsFrom } from "../ui/kinetic";
import { BIG_EYES, type Eyes, FULL_FRAME, Morph, type Rect } from "../ui/morph";
import { Paper, Sheet } from "../ui/sheet";
import { AGENT_EYES } from "./notch-story";

// The window (41.7 mm) and the screen's active area (38.99 mm) seen straight on, in pixels.
const WINDOW = 41.7 * PX_PER_MM;
const ACTIVE = 38.99 * PX_PER_MM;
const SHELL = 46.8 * PX_PER_MM;
const LINE = "#A3A3A3";

const SWAPS: [number, ColourId, string][] = [
  [70, "white", "happy"],
  [71.5, "cobalt", "wink"],
  [72, "lime", "loved"],
  [72.5, "lilac", "joy"],
  [73, "sun", "cute"],
  [73.5, "coal", "happy"],
  [74, "white", "happy"],
];

// The window (41.7 mm) seen straight on, and where the face engine puts the eyes in the screen.
export const CHARM_WINDOW: Rect = {
  x: 960 - WINDOW / 2,
  y: 540 - WINDOW / 2,
  w: WINDOW,
  h: WINDOW,
  r: 3.9 * PX_PER_MM,
};
export const CHARM_EYES: Eyes = {
  lx: 960 - ACTIVE * 0.215,
  ly: 540 - ACTIVE / 2 + ACTIVE * 0.46,
  rx: 960 + ACTIVE * 0.215,
  ry: 540 - ACTIVE / 2 + ACTIVE * 0.46,
  size: ACTIVE * 0.34,
};

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
          font: `500 24px/1 ${MONO}`,
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

// Starts at beat 68: the face moves into a body you print, turns once through its colours, and
// grows back into the whole frame for the finale.
export function Body() {
  const frame = useCurrentFrame();
  const B = (n: number) => beat(n) - beat(68);
  const handoff = span(frame, 0, B(70), snap);
  const handback = span(frame, B(74), B(75), snap);
  const [swapAt, colourId, faceId] = step(
    frame,
    SWAPS.map((s) => [B(s[0]), s] as [number, (typeof SWAPS)[number]])
  );
  const c = colour(colourId);
  const f = face(faceId);
  // one full turn, back to face-on for the hand-back
  const turn = keys(
    frame,
    [
      [B(71.5), 0],
      [B(73.85), Math.PI * 2],
    ],
    snap
  );
  const sinceSwap = frame - B(swapAt);
  const pop =
    frame < B(71.5)
      ? 1
      : 1 - 0.18 * Math.exp(-sinceSwap / 5) * Math.cos(sinceSwap / 2.4);
  const ms = (frame / FPS) * 1000;

  const pose: CharmPose = {
    rotY: turn,
    rotX: Math.sin(turn) * 0.06,
    y: 0,
    scale: 1,
    colour: c,
    glyphs: {
      face: f,
      colour: c,
      pop,
      look: { x: 0, y: 0 },
      cursorOn: Math.floor(ms / 500) % 2 === 0,
      t: ms,
    },
  };

  const dims = span(frame, B(70), B(71), out) - span(frame, B(71.25), B(71.6));
  const half = SHELL / 2;
  const top = 540 - half;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Paper />
      <div
        style={{
          position: "absolute",
          left: 960 - 300,
          top: 540 + half + 30,
          width: 600,
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
          left: 960 - half - 56 - 410,
          top: 528,
          width: 380,
          textAlign: "right",
          font: `500 24px/1 ${MONO}`,
          letterSpacing: "0.14em",
          color: "#6E6E6E",
          opacity: Math.max(0, dims),
        }}
      >
        480 × 480 AMOLED
      </div>

      <Kinetic
        frame={frame}
        words={wordsFrom("Next: a body you can hold.", B(70.25), 5)}
        leave={B(73.6)}
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
          font: `500 24px/1 ${MONO}`,
          letterSpacing: "0.14em",
          color: "#6E6E6E",
          opacity: span(frame, B(71), B(71.5)) - span(frame, B(73.6), B(73.85)),
        }}
      >
        OPEN HARDWARE · PRINT YOUR OWN
      </div>

      <Sheet frame={frame + beat(68)} from={beat(8)} />
      {frame < B(70) && (
        <Morph
          p={handoff}
          from={FULL_FRAME}
          to={CHARM_WINDOW}
          eyesFrom={AGENT_EYES}
          eyesTo={CHARM_EYES}
          face={face("happy")}
          colour={colour("white")}
        />
      )}
      {frame >= B(74) && (
        <Morph
          p={handback}
          from={CHARM_WINDOW}
          to={FULL_FRAME}
          eyesFrom={CHARM_EYES}
          eyesTo={BIG_EYES}
          face={face("happy")}
          colour={colour("white")}
        />
      )}
    </div>
  );
}
