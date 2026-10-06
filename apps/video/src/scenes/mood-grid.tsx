import { type ColourId, colour, face } from "../charm/engine";
import { NotchCharm } from "../charm/notch";
import { MONO } from "../fonts";
import { back, rand, span } from "../motion";
import { FPS, beat } from "../track";

const TILES: {
  face: string;
  colour: ColourId;
  text?: string;
  label: string;
}[] = [
  {
    face: "thinking",
    colour: "white",
    text: "Reading the codebase…",
    label: "THINKING",
  },
  {
    face: "focused",
    colour: "cobalt",
    text: "Running migrations…",
    label: "WORKING",
  },
  { face: "joy", colour: "lime", text: "Done. 48 passing.", label: "DONE" },
  {
    face: "learned",
    colour: "lilac",
    text: "New skill: deploys.",
    label: "LEARNED",
  },
  { face: "wink", colour: "sun", text: "Noted: dark mode.", label: "NOTED" },
  { face: "sleepy", colour: "coal", label: "ASLEEP" },
];

const W = 1920 / 3;
const H = 1080 / 2;
const K = 1.3;

// Six charms, six colours, six moods: one every half beat.
export function MoodGrid({ frame, from }: { frame: number; from: number }) {
  const ms = (frame / FPS) * 1000;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#0A0A0A" }}>
      {TILES.map((t, i) => {
        const at = from + beat(i * 0.5) - beat(0);
        const p = span(frame, at, at + 14, back);
        const col = i % 3;
        const row = Math.floor(i / 3);
        return (
          <div
            key={t.label}
            style={{
              position: "absolute",
              left: col * W + 1,
              top: row * H + 1,
              width: W - 2,
              height: H - 2,
              overflow: "hidden",
              background: "#ECECEA",
              opacity: p > 0 ? 1 : 0,
              transform: `scale(${0.9 + 0.1 * p})`,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: W / 2,
                top: 150,
                transform: `scale(${K})`,
                transformOrigin: "0 0",
              }}
            >
              <NotchCharm
                s={{
                  face: face(t.face),
                  colour: colour(t.colour),
                  open: t.text ? Math.min(1, p * 1.2) : 0,
                  panel: 132,
                  text: t.text,
                  shown: Math.floor((frame - at) * 1.4),
                  ms: ms + i * 700,
                  cursorOn: Math.floor(ms / 500) % 2 === 0,
                  look: { x: (rand(i) * 2 - 1) * 0.5, y: 0 },
                }}
              />
            </div>
            <div
              style={{
                position: "absolute",
                left: 36,
                bottom: 30,
                font: `500 20px/1 ${MONO}`,
                letterSpacing: "0.14em",
                color: "#6E6E6E",
              }}
            >
              {String(i + 1).padStart(2, "0")} · {t.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
