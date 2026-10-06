import { SANS } from "../fonts";

function Cap({ label, w, down }: { label: string; w: number; down: number }) {
  const h = 128;
  const depth = 14;
  return (
    <div style={{ position: "relative", width: w, height: h + depth }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: depth,
          width: w,
          height: h,
          borderRadius: 26,
          background: "#BDBDB8",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: depth * down,
          width: w,
          height: h,
          borderRadius: 26,
          background: "#FFFFFF",
          boxShadow: "inset 0 0 0 1.5px rgba(10,10,10,0.08)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: label.length > 1 ? "flex-start" : "center",
          padding: "0 26px 22px",
          boxSizing: "border-box",
          font: `500 ${label.length > 1 ? 30 : 50}px/1 ${SANS}`,
          color: "#0A0A0A",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// The talk key: ⌥ Space, pressed with the beat.
export function TalkKeys({
  down,
  opacity = 1,
}: {
  down: number;
  opacity?: number;
}) {
  return (
    <div style={{ display: "flex", gap: 18, opacity }}>
      <Cap label="⌥" w={128} down={down} />
      <Cap label="space" w={480} down={down} />
    </div>
  );
}
