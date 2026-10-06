import { type Colour, type Face } from "../charm/engine";
import { Glyph } from "../charm/glyph";

export type Rect = { x: number; y: number; w: number; h: number; r: number };
export type Eyes = {
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  size: number;
};

export const FULL_FRAME: Rect = { x: 0, y: 0, w: 1920, h: 1080, r: 0 };

// The face engine's full-screen layout, on a black 1920 × 1080 frame.
export const BIG_EYES: Eyes = {
  lx: 960 - 1080 * 0.215,
  ly: 1080 * 0.46,
  rx: 960 + 1080 * 0.215,
  ry: 1080 * 0.46,
  size: 1080 * 0.34,
};

const mix = (a: number, b: number, p: number) => a + (b - a) * p;

// The black of the charm's screen and its two eyes, moving from one body to another.
export function Morph({
  p,
  from,
  to,
  eyesFrom,
  eyesTo,
  face,
  colour,
  blink,
  look = { x: 0, y: 0 },
}: {
  p: number;
  from: Rect;
  to: Rect;
  eyesFrom: Eyes;
  eyesTo: Eyes;
  face: Face;
  colour: Colour;
  blink?: boolean;
  look?: { x: number; y: number };
}) {
  const r = {
    x: mix(from.x, to.x, p),
    y: mix(from.y, to.y, p),
    w: mix(from.w, to.w, p),
    h: mix(from.h, to.h, p),
    r: mix(from.r, to.r, p),
  };
  const size = mix(eyesFrom.size, eyesTo.size, p);
  const lookX = look.x * size * 0.1;
  const lookY = look.y * size * 0.07;
  const tilt = face.tilt ?? 0;
  const centreX =
    (mix(eyesFrom.lx, eyesTo.lx, p) + mix(eyesFrom.rx, eyesTo.rx, p)) / 2;
  const centreY =
    (mix(eyesFrom.ly, eyesTo.ly, p) + mix(eyesFrom.ry, eyesTo.ry, p)) / 2;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          left: r.x,
          top: r.y,
          width: r.w,
          height: r.h,
          borderRadius: r.r,
          background: "#000",
        }}
      />
      {/* tilt turns the whole face around its centre, as in the face engine */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: `${centreX}px ${centreY}px`,
          transform: `rotate(${tilt}deg)`,
        }}
      >
        <Glyph
          ch={blink ? "−" : face.L}
          x={mix(eyesFrom.lx, eyesTo.lx, p) + lookX}
          y={mix(eyesFrom.ly, eyesTo.ly, p) + lookY}
          size={size}
          colour={colour.g}
          rotate={face.rl ?? 0}
          scale={face.sl ?? 1}
        />
        <Glyph
          ch={blink ? "−" : face.R}
          x={mix(eyesFrom.rx, eyesTo.rx, p) + lookX}
          y={mix(eyesFrom.ry, eyesTo.ry, p) + lookY}
          size={size}
          colour={colour.g}
          rotate={face.rr ?? 0}
          scale={face.sr ?? 1}
        />
      </div>
    </div>
  );
}
