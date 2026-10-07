import { useCurrentFrame, useVideoConfig } from "remotion";
import { colour } from "../charm/engine";
import { Glyph } from "../charm/glyph";
import { keys, step } from "../motion";

// brand/build_icon.py's head, full-bleed: the black screen squircle (n 3.5) fills the square, edge
// to edge. The app icon's white rim vanishes on light pages and makes the icon look small next to
// others in a list. The corners stay white, not transparent: a GIF has no soft transparent edge, so
// the curve would be jagged; on dark pages they read as the white shell. The face is the app
// icon's (carets 22 % of the icon wide, 19 % either side of the middle, 47 % down), zoomed by the
// rim it no longer has.
const SCREEN_N = 3.5;
const INSET = 0.085;
const ZOOM = 1 / (1 - 2 * INSET);
const EYE_DX = 0.19 * ZOOM;
const EYE_Y = 0.5 + (0.47 - 0.5) * ZOOM;
// Geist Mono 800's caret is 428 units wide in 1000 (CARET_W): this em gives the 22 % caret.
const EYE_EM = (0.22 / 0.428) * ZOOM;

function squircle(size: number, n: number): string {
  const h = size / 2;
  const points: string[] = [];
  for (let i = 0; i < 360; i++) {
    const t = (i / 360) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = size / 2 + h * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = size / 2 + h * Math.sign(s) * Math.abs(s) ** (2 / n);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

// The app icon's face, alive: a blink, a glance each way, a wink, back where it started (it loops).
export function IconAnimated() {
  const frame = useCurrentFrame();
  const { width: size, fps } = useVideoConfig();
  const t = frame / fps;
  const glyph = colour("white").g;
  const blink = (t > 0.9 && t < 1.02) || (t > 3.3 && t < 3.42);
  const wink = t > 2.35 && t < 2.85;
  const look = keys(frame, [
    [Math.round(1.3 * fps), 0],
    [Math.round(1.45 * fps), -1],
    [Math.round(1.75 * fps), -1],
    [Math.round(1.9 * fps), 1],
    [Math.round(2.2 * fps), 1],
    [Math.round(2.35 * fps), 0],
  ]);
  const pop = wink ? 1.06 : 1;
  const left = blink ? "−" : "^";
  const right = blink || wink ? "−" : "^";
  const em = size * EYE_EM * pop;
  const shift = look * size * 0.025 * ZOOM;
  const tilt = step(frame, [
    [0, 0],
    [Math.round(2.35 * fps), -5],
    [Math.round(2.85 * fps), 0],
  ]);
  return (
    <div style={{ position: "absolute", inset: 0, background: "#FFFFFF" }}>
      <svg
        width={size}
        height={size}
        style={{ position: "absolute", inset: 0 }}
      >
        <path d={squircle(size, SCREEN_N)} fill="#000000" />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: `${size / 2}px ${size * EYE_Y}px`,
          transform: `rotate(${tilt}deg)`,
        }}
      >
        <Glyph
          ch={left}
          x={size / 2 - size * EYE_DX + shift}
          y={size * EYE_Y}
          size={em}
          colour={glyph}
        />
        <Glyph
          ch={right}
          x={size / 2 + size * EYE_DX + shift}
          y={size * EYE_Y}
          size={em}
          colour={glyph}
        />
      </div>
    </div>
  );
}
