import { SANS } from "../fonts";

const INK = "#0A0A0A";

// A key drawn flat, in ink: it sits on its own shadow and sinks into it when pressed.
function Cap({ label, w, down }: { label: string; w: number; down: number }) {
  const h = 124;
  const depth = 12;
  return (
    <div style={{ position: "relative", width: w, height: h + depth }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: depth,
          width: w,
          height: h,
          borderRadius: 24,
          background: INK,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: depth * down,
          width: w,
          height: h,
          borderRadius: 24,
          background: down > 0.5 ? "#F6F6F4" : "#FFFFFF",
          border: `2px solid ${INK}`,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: label.length > 1 ? "flex-start" : "center",
          padding: "0 26px 22px",
          font: `500 ${label.length > 1 ? 30 : 50}px/1 ${SANS}`,
          color: INK,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// The talk key: ⌥ Space, pressed with the beat.
export function TalkKeys({ down }: { down: number }) {
  return (
    <div style={{ display: "flex", gap: 18 }}>
      <Cap label="⌥" w={124} down={down} />
      <Cap label="space" w={480} down={down} />
    </div>
  );
}
