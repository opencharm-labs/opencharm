import { MONO } from "../fonts";
import { type Colour, type Face, SIGNAL } from "./engine";
import { Glyph } from "./glyph";

export type NotchState = {
  face: Face;
  colour: Colour;
  // 0 = only the strip by the notch, 1 = the panel fully open.
  open: number;
  panel: number;
  text?: string;
  shown?: number;
  hint?: string;
  ring?: number;
  flap?: string | null;
  blink?: boolean;
  look?: { x: number; y: number };
  swell?: number;
  pop?: number;
  cursorOn?: boolean;
  ms: number;
  // While the eyes are on their way to or from another body (see ui/morph.tsx).
  noEyes?: boolean;
};

// A MacBook's notch and the desktop charm around it, in screen points. The layout follows the
// firmware's notch shape (firmware/core/src/ui/lvgl_view.cpp, apply_notch and set_mode).
export const NOTCH = { width: 196, strip: 37, wide: 430, panel: 212 };

export function notchPanelHeight(s: { open: number; panel: number }): number {
  return NOTCH.strip + (s.panel - NOTCH.strip) * s.open;
}

// Drawn around x = 0 (the screen's centre) and y = 0 (its top edge).
export function NotchCharm({ s }: { s: NotchState }) {
  const { strip, width: notchW, wide } = NOTCH;
  const f = s.face;
  const height = notchPanelHeight(s);
  const radius = strip * 0.5 + (30 - strip * 0.5) * Math.min(1, s.open * 1.4);
  const breath = Math.sin((2 * Math.PI * s.ms) / 4200);
  const look = s.look ?? { x: 0, y: 0 };
  const size = strip * 1.05 * (s.pop ?? 1);
  const ear = notchW / 2 + strip * 0.85;
  const cy = strip / 2 + look.y * strip * 0.06 + breath * strip * 0.035;
  const shift = look.x * strip * 0.08;
  const swell = s.swell ?? 1;
  const left = s.blink ? "−" : f.L;
  const right = s.blink ? "−" : f.R;
  const mouth = s.flap ?? f.M;
  const cursorHidden = f.fx === "cursor" && s.cursorOn === false && !s.flap;
  const text = s.text ? [...s.text].slice(0, s.shown ?? Infinity).join("") : "";
  const ring = s.ring ?? 0;
  const tint = s.colour.g;

  return (
    <div style={{ position: "absolute", left: 0, top: 0 }}>
      <div
        style={{
          position: "absolute",
          left: -wide / 2,
          top: 0,
          width: wide,
          height,
          background: "#000",
          borderRadius: `0 0 ${radius}px ${radius}px`,
          overflow: "hidden",
        }}
      >
        {ring > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: strip,
              width: wide,
              height: height - strip,
              boxSizing: "border-box",
              border: `4.4px solid ${SIGNAL}`,
              borderRadius: 30, // the panel's own corners (firmware kNotchPanelRadius)
              opacity: ring,
            }}
          />
        )}
        {text && (
          <div
            style={{
              position: "absolute",
              left: wide * 0.07,
              width: wide * 0.86,
              top: strip * 1.85,
              font: `500 17px/1.45 ${MONO}`,
              color: tint,
              textAlign: "center",
              opacity: Math.min(1, s.open * 2 - 0.6),
            }}
          >
            {text}
          </div>
        )}
        {s.hint && (
          <div
            style={{
              position: "absolute",
              left: 0,
              width: wide,
              top: s.panel * 0.83,
              font: `500 11px/1 ${MONO}`,
              letterSpacing: "0.12em",
              whiteSpace: "pre",
              color: tint,
              textAlign: "center",
              opacity: 0.6 * Math.max(0, s.open * 2 - 1),
            }}
          >
            {s.hint}
          </div>
        )}
      </div>
      {!s.noEyes && (
        <>
          <Glyph
            ch={left}
            x={-ear + shift}
            y={cy + (f.dl ?? 0) * strip}
            size={size}
            colour={tint}
            rotate={(f.tilt ?? 0) + (f.rl ?? 0)}
            scale={(f.sl ?? 1) * swell}
          />
          <Glyph
            ch={right}
            x={ear + shift}
            y={cy + (f.dr ?? 0) * strip}
            size={size}
            colour={tint}
            rotate={(f.tilt ?? 0) + (f.rr ?? 0)}
            scale={(f.sr ?? 1) * swell}
          />
        </>
      )}
      {mouth && !cursorHidden && s.open > 0.35 && (
        <Glyph
          ch={mouth}
          x={0}
          y={strip * 1.36}
          size={strip * 0.7}
          colour={tint}
          rotate={f.tilt ?? 0}
          opacity={Math.min(1, (s.open - 0.35) * 3)}
        />
      )}
      {f.fx === "z" && (
        <Glyph
          ch="z"
          x={ear + size * 0.55 + ((s.ms % 2400) / 2400) * strip * 0.3}
          y={strip * 0.05 + (1 - (s.ms % 2400) / 2400) * strip * 0.2}
          size={strip * 0.42}
          colour={tint}
          opacity={Math.sin(((s.ms % 2400) / 2400) * Math.PI)}
        />
      )}
    </div>
  );
}
