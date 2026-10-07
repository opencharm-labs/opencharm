import { useCurrentFrame, useVideoConfig } from "remotion";
import { colour } from "../charm/engine";
import { Glyph } from "../charm/glyph";
import { keys, step } from "../motion";

// brand/build_icon.py's face, full-bleed: the black screen fills the square (no white rim, which
// vanishes on white pages and makes the icon look small next to others on Product Hunt). Corners
// stay square: a GIF has no soft transparent edge, so a baked-in squircle would be jagged. Everything scales by 1 / (1 − 2 × 8.5 %) so the face
// keeps the app icon's proportions: carets 22 % of the screen wide, 19 % either side of the middle,
// 47 % down.
const ZOOM = 1 / (1 - 2 * 0.085);
const EYE_DX = 0.19 * ZOOM;
const EYE_Y = 0.5 - 0.03 * ZOOM;
// Geist Mono 800's caret is about 0.43 em wide (measured on a frame): this em gives the 22 % caret.
const EYE_EM = 0.51 * ZOOM;

// The app icon, alive: a blink, a glance each way, a wink, back where it started (it loops).
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
    <div style={{ position: "absolute", inset: 0, background: "#000000" }}>
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
