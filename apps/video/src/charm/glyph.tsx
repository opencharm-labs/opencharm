import { MONO } from "../fonts";

type Props = {
  ch: string;
  x: number;
  y: number;
  size: number;
  colour: string;
  rotate?: number;
  scale?: number;
  scaleY?: number;
  weight?: number;
  opacity?: number;
};

const inkCache = new Map<string, number>();

// Like the face engine: the glyph sits on its optical centre (the middle of its ink), not its
// baseline, so "o", "O", "^" and "♥" all look centred. Measured once per glyph at 100 px.
function inkCentre(ch: string, weight: number): number {
  const key = `${weight}:${ch}`;
  const known = inkCache.get(key);
  if (known != null) return known;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return 0.35;
  ctx.font = `${weight} 100px ${MONO}`;
  const m = ctx.measureText(ch);
  const centre =
    ((m.actualBoundingBoxAscent || 70) - (m.actualBoundingBoxDescent || 0)) /
    200;
  inkCache.set(key, centre);
  return centre;
}

// One glyph as SVG text, so it stays sharp at any camera zoom.
export function Glyph({
  ch,
  x,
  y,
  size,
  colour,
  rotate = 0,
  scale = 1,
  scaleY,
  weight = 800,
  opacity = 1,
}: Props) {
  return (
    <svg
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        overflow: "visible",
        opacity,
      }}
      width={1}
      height={1}
    >
      <text
        transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale} ${scaleY ?? scale})`}
        y={inkCentre(ch, weight) * size}
        textAnchor="middle"
        fill={colour}
        style={{ font: `${weight} ${size}px ${MONO}` }}
      >
        {ch}
      </text>
    </svg>
  );
}
