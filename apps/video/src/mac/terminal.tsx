import { MONO, SANS } from "../fonts";

export type Line = { at: number; text: string; tone?: "dim" | "ok" | "cmd" };

const TONES = { dim: "#7a7a7a", ok: "#d6f78a", cmd: "#f6f6f4" };

// A terminal window with an agent at work: each line types itself in from its frame.
export function Terminal({
  frame,
  lines,
  x,
  y,
  w,
  h,
  title = "agent — ~/shop",
}: {
  frame: number;
  lines: Line[];
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
}) {
  const visible = lines.filter((l) => frame >= l.at);
  const rows = Math.floor((h - 70) / 26);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        background: "#0c0c0c",
        borderRadius: 14,
        border: "2px solid #0A0A0A",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 36,
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingLeft: 16,
          borderBottom: "1px solid #1d1d1d",
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              background: "#3a3a3a",
            }}
          />
        ))}
        <div
          style={{
            marginLeft: "auto",
            marginRight: "auto",
            transform: "translateX(-30px)",
            font: `500 13px/1 ${SANS}`,
            color: "#8a8a8a",
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          padding: "18px 22px",
          font: `400 15px/26px ${MONO}`,
          color: "#d8d8d8",
        }}
      >
        {visible.slice(-rows).map((l) => {
          const typed = Math.min(l.text.length, Math.floor((frame - l.at) * 3));
          return (
            <div
              key={l.at + l.text}
              style={{ color: TONES[l.tone ?? "cmd"], whiteSpace: "pre" }}
            >
              {l.text.slice(0, typed)}
            </div>
          );
        })}
        <div
          style={{
            width: 9,
            height: 18,
            marginTop: 4,
            background: "#d8d8d8",
            opacity: Math.floor(frame / 30) % 2 ? 0 : 1,
          }}
        />
      </div>
    </div>
  );
}
