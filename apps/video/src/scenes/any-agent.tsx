import { useCurrentFrame } from "remotion";
import { colour, face } from "../charm/engine";
import { Glyph } from "../charm/glyph";
import { SANS } from "../fonts";
import { out, span, step } from "../motion";
import { beat } from "../track";
import { AGENT_EYES } from "./notch-story";

const AGENTS = [
  "Claude Code",
  "Codex",
  "Gemini CLI",
  "goose",
  "Hermes",
  "OpenClaw",
];

// Starts at beat 60: the panel has filled the frame; the agents it can wear go by, one a beat.
export function AnyAgent() {
  const frame = useCurrentFrame();
  const B = (n: number) => beat(n) - beat(60);
  const index = Math.min(AGENTS.length - 1, Math.floor(frame / B(61)));
  const final = frame >= B(66);
  const f = face(
    final
      ? "joy"
      : step(frame, [
          [0, "happy"],
          [B(62), "curious"],
          [B(64), "happy"],
        ])
  );
  const look = final ? { x: 0, y: 0 } : { x: index % 2 ? 0.9 : -0.9, y: 0.8 };
  const sinceBeat = frame % B(61);
  const pulse = 1 + 0.08 * Math.exp(-sinceBeat / 5);
  const g = colour("white").g;
  const fade = span(frame, B(67.5), B(68));

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      <Glyph
        ch={f.L}
        x={AGENT_EYES.lx + look.x * 22}
        y={AGENT_EYES.ly + look.y * 16}
        size={AGENT_EYES.size}
        colour={g}
        scale={(f.sl ?? 1) * pulse}
        rotate={(f.tilt ?? 0) + (f.rl ?? 0)}
      />
      <Glyph
        ch={f.R}
        x={AGENT_EYES.rx + look.x * 22}
        y={AGENT_EYES.ry + look.y * 16}
        size={AGENT_EYES.size}
        colour={g}
        scale={(f.sr ?? 1) * pulse}
        rotate={(f.tilt ?? 0) + (f.rr ?? 0)}
      />
      {f.M && (
        <Glyph ch={f.M} x={960} y={AGENT_EYES.ly + 150} size={130} colour={g} />
      )}
      {!final && (
        <div
          key={index}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 640,
            textAlign: "center",
            font: `600 150px/1 ${SANS}`,
            letterSpacing: "-0.05em",
            color: "#EDEDED",
            transform: `translateY(${(1 - span(sinceBeat, 0, 10, out)) * 40}px)`,
            opacity: span(sinceBeat, 0, 6),
          }}
        >
          {AGENTS[index]}
        </div>
      )}
      {final && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 650,
            textAlign: "center",
            font: `600 130px/1 ${SANS}`,
            letterSpacing: "-0.05em",
            color: "#EDEDED",
            opacity: span(frame, B(66), B(66) + 8) - fade,
          }}
        >
          Your agent. Its face.
        </div>
      )}
    </div>
  );
}
