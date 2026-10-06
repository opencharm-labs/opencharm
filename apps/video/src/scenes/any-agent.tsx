import { useCurrentFrame } from "remotion";
import { colour, face } from "../charm/engine";
import { Glyph } from "../charm/glyph";
import { SANS } from "../fonts";
import { out, span, step } from "../motion";
import { beat, beatAt } from "../track";
import { Sheet } from "../ui/sheet";
import { AGENT_EYES } from "./notch-story";

// The face engine sizes a face from its screen's short side: these eyes are 0.34 of it.
const FACE_UNIT = AGENT_EYES.size / 0.34;

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
  const now = beatAt(frame + beat(60));
  const index = Math.min(AGENTS.length - 1, now.index - 60);
  const final = frame >= B(66);
  const f = face(
    final
      ? "happy"
      : step(frame, [
          [0, "happy"],
          [B(62), "curious"],
          [B(64), "happy"],
        ])
  );
  const look = final ? { x: 0, y: 0 } : { x: index % 2 ? 0.9 : -0.9, y: 0.8 };
  const sinceBeat = now.since;
  const pulse = 1 + 0.08 * Math.exp(-sinceBeat / 5);
  const g = colour("white").g;
  const fade = span(frame, B(67.5), B(68));

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      {/* Like the face engine: offsets move, and tilt turns, the whole face around its centre. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: `960px ${AGENT_EYES.ly}px`,
          transform: `translate(${(f.gx ?? 0) * FACE_UNIT}px, ${((f.gy ?? 0) + (f.dy ?? 0)) * FACE_UNIT}px) rotate(${f.tilt ?? 0}deg)`,
        }}
      >
        <Glyph
          ch={f.L}
          x={AGENT_EYES.lx + look.x * 22}
          y={AGENT_EYES.ly + look.y * 16}
          size={AGENT_EYES.size}
          colour={g}
          scale={(f.sl ?? 1) * pulse}
          rotate={f.rl ?? 0}
        />
        <Glyph
          ch={f.R}
          x={AGENT_EYES.rx + look.x * 22}
          y={AGENT_EYES.ry + look.y * 16}
          size={AGENT_EYES.size}
          colour={g}
          scale={(f.sr ?? 1) * pulse}
          rotate={f.rr ?? 0}
        />
        {f.M && (
          <Glyph
            ch={f.M}
            x={960}
            y={AGENT_EYES.ly + 150}
            size={130}
            colour={g}
          />
        )}
      </div>
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
      <Sheet frame={frame + beat(60)} from={beat(8)} night />
    </div>
  );
}
