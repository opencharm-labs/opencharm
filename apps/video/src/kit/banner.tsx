import { useCurrentFrame, useVideoConfig } from "remotion";
import { Charm3D } from "../charm/charm-3d";
import { type ColourId, colour, face } from "../charm/engine";
import { MONO, SANS } from "../fonts";
import { type Key, keys } from "../motion";
import { Paper, Sheet } from "../ui/sheet";

type Move = { blinks: number[]; look?: [number, number][]; wink?: number };

// The GitHub organisation's banner (github.com/opencharm-labs): the drawing paper, the line, and
// three printed charms that blink and glance. It loops, so nothing drifts with time: the breath is
// held (t fixed) and every move ends where it started.
export const BANNER = { width: 1920, height: 600, seconds: 4 };

const INK = "#0A0A0A";

function Shell({
  x,
  y,
  scale,
  rotY,
  c,
  f,
  move,
}: {
  x: number;
  y: number;
  scale: number;
  rotY: number;
  c: ColourId;
  f: string;
  move: Move;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const shell = colour(c);
  const blink = move.blinks.some((at) => t > at && t < at + 0.12);
  const winking =
    move.wink !== undefined && t > move.wink && t < move.wink + 0.5;
  const look = move.look
    ? keys(
        frame,
        move.look.map(([at, v]): Key => [Math.round(at * fps), v])
      )
    : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: x - 960,
        top: y - 540,
        width: 1920,
        height: 1080,
      }}
    >
      <Charm3D
        pose={{
          rotY,
          rotX: 0.08,
          y: 0,
          scale,
          colour: shell,
          glyphs: {
            face: face(winking ? "wink" : f),
            colour: shell,
            blink,
            look: { x: look, y: 0 },
            t: 900,
          },
        }}
      />
    </div>
  );
}

export function Banner() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Paper />
      <div style={{ position: "absolute", left: 150, top: 118, color: INK }}>
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
            ^ ^
          </span>
          <span
            style={{
              font: `400 20px/1 ${MONO}`,
              letterSpacing: "0.14em",
              color: "#6E6E6E",
            }}
          >
            OPENCHARM · OPEN SOURCE
          </span>
        </div>
        <div
          style={{
            marginTop: 26,
            font: `600 88px/0.98 ${SANS}`,
            letterSpacing: "-0.045em",
          }}
        >
          Meet your agentic
          <br />
          companion.
        </div>
        <div
          style={{
            marginTop: 24,
            font: `400 30px/1.4 ${SANS}`,
            color: "#3A3A3A",
            maxWidth: 900,
          }}
        >
          A face, a voice and one key for the agent you already run.
        </div>
      </div>
      <Shell
        x={1150}
        y={310}
        scale={0.46}
        rotY={0.5}
        c="lilac"
        f="cute"
        move={{ blinks: [1.6] }}
      />
      <Shell
        x={1690}
        y={310}
        scale={0.46}
        rotY={-0.5}
        c="lime"
        f="happy"
        move={{ blinks: [0.4], wink: 2.6 }}
      />
      <Shell
        x={1420}
        y={318}
        scale={0.68}
        rotY={-0.12}
        c="white"
        f="happy"
        move={{
          blinks: [0.9, 3.3],
          look: [
            [1.3, 0],
            [1.45, -1],
            [1.75, -1],
            [1.9, 1],
            [2.2, 1],
            [2.35, 0],
          ],
        }}
      />
      <Sheet frame={0} from={-100} />
    </div>
  );
}
