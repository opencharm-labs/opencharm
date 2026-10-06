import type { CSSProperties, ReactNode } from "react";
import { MONO, SANS } from "../fonts";

// Brand resources share the site's section head: an ink number tag, a mono label, a Geist title.
const INK = "#0A0A0A";

export function Head({
  n,
  label,
  title,
  sub,
  style,
  size = 92,
}: {
  n: string;
  label: string;
  title: string;
  sub?: string;
  style?: CSSProperties;
  size?: number;
}) {
  return (
    <div style={{ position: "absolute", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span
          style={{
            background: INK,
            color: "#FFFFFF",
            font: `600 20px/1 ${MONO}`,
            letterSpacing: "0.12em",
            padding: "7px 10px",
            borderRadius: 3,
          }}
        >
          {n}
        </span>
        <span
          style={{
            font: `400 20px/1 ${MONO}`,
            letterSpacing: "0.14em",
            color: "#6E6E6E",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          marginTop: 26,
          font: `600 ${size}px/0.98 ${SANS}`,
          letterSpacing: "-0.045em",
          color: INK,
        }}
      >
        {title}
      </div>
      {sub && (
        <div
          style={{
            marginTop: 22,
            font: `400 30px/1.4 ${SANS}`,
            color: "#3A3A3A",
            maxWidth: 820,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// The address, small, where a drawing carries its sheet number.
export function Address({ dark = false }: { dark?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        right: 110,
        bottom: 40,
        font: `500 20px/1 ${MONO}`,
        letterSpacing: "0.14em",
        color: dark ? "#EDEDED" : INK,
      }}
    >
      OPENCHARM.DEV
    </div>
  );
}

// A box that draws a 1920 × 1080 scene at another size and place.
export function Fit({
  x,
  y,
  scale,
  children,
}: {
  x: number;
  y: number;
  scale: number;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 1920,
        height: 1080,
        transform: `scale(${scale})`,
        transformOrigin: "0 0",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}
