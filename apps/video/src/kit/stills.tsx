import { useVideoConfig } from "remotion";
import { Charm3D } from "../charm/charm-3d";
import { type ColourId, colour, face } from "../charm/engine";
import { NotchCharm, type NotchState } from "../charm/notch";
import { MONO } from "../fonts";
import { MacStage } from "../mac/mac-stage";
import { SCREEN } from "../mac/mac-screen";
import { type Camera } from "../scenes/notch-timeline";
import { TalkKeys } from "../ui/keycaps";
import { Leader, Paper, PAPER, Sheet } from "../ui/sheet";
import { Address, Head } from "./layout";

// 1270 × 760 at 1.512x: renders at 1270 × 760 (scale 0.6615) or twice that (scale 1.323).
export const STILL = { width: 1920, height: 1149 };

const AGENTS: [string, ColourId, string][] = [
  ["Claude Code", "white", "happy"],
  ["Codex", "cobalt", "joy"],
  ["Gemini CLI", "lime", "curious"],
  ["goose", "lilac", "cute"],
  ["Hermes", "sun", "wink"],
  ["OpenClaw", "coal", "happy"],
];

type CharmSpec = Omit<Partial<NotchState>, "face" | "colour"> & {
  face: string;
  colour?: ColourId;
};

const charm = ({ face: f, colour: c, ...rest }: CharmSpec): NotchState => ({
  open: 0,
  panel: 118,
  ms: 900,
  ...rest,
  face: face(f),
  colour: colour(c ?? "white"),
});

// A point on the Mac screen, in this frame's pixels.
function at(cam: Camera, x: number, y: number, w: number, h: number) {
  return { x: w / 2 + (x - cam.cx) * cam.z, y: h / 2 + (y - cam.cy) * cam.z };
}

function Hero() {
  const { width: w, height: h } = useVideoConfig();
  const cam: Camera = { cx: SCREEN.w / 2, cy: 171, z: 2.6, roll: 0 };
  const eye = at(cam, SCREEN.w / 2 + 196 / 2 + 37 * 0.85, 18.5, w, h);
  return (
    <>
      <MacStage
        cam={cam}
        notch={
          <NotchCharm
            s={charm({ face: "joy", open: 1, text: "All 48 pass. Pushed." })}
          />
        }
      />
      <Leader
        p={1}
        from={{ x: 1330, y: 680 }}
        to={{ x: eye.x, y: at(cam, 0, 118, w, h).y + 8 }}
        title="THE DESKTOP CHARM"
        note="MACOS · WINDOWS"
        align="left"
      />
      <Head
        n="01"
        label="OPENCHARM"
        title="Give your agent a face."
        sub="Eyes by your Mac's notch that show what your agent is doing. Open source."
        style={{ left: 150, top: 640 }}
        size={104}
      />
    </>
  );
}

const MOODS: [string, ColourId, string, string][] = [
  ["Reading the codebase…", "white", "thinking", "THINKING"],
  ["Running migrations…", "cobalt", "focused", "WORKING"],
  ["Done. 48 passing.", "lime", "joy", "DONE"],
  ["New skill: deploys.", "lilac", "learned", "LEARNED"],
  ["Noted: dark mode.", "sun", "wink", "NOTED"],
  ["", "coal", "sleepy", "ASLEEP"],
];

// Six charms by their notch, in a spec table: the panel's line, and a mono label under it.
function Tiles({ items }: { items: [string, ColourId, string, string][] }) {
  const W = 520;
  const H = 250;
  const K = 1.08;
  return (
    <>
      {items.map(([text, c, f, label], i) => (
        <div
          key={label}
          style={{
            position: "absolute",
            left: 150 + (i % 3) * (W + 40),
            top: 400 + Math.floor(i / 3) * (H + 40),
            width: W,
            height: H,
            ...PAPER,
            border: "1.5px solid #0A0A0A",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: W / 2,
              top: 30,
              transform: `scale(${K})`,
              transformOrigin: "0 0",
            }}
          >
            <NotchCharm
              s={charm({
                face: f,
                colour: c,
                open: text ? 1 : 0,
                text: text || undefined,
                ms: 700 * i,
              })}
            />
          </div>
          <div
            style={{
              position: "absolute",
              left: 22,
              bottom: 18,
              font: `500 18px/1 ${MONO}`,
              letterSpacing: "0.14em",
              color: "#6E6E6E",
            }}
          >
            S.{String(i + 1).padStart(2, "0")} · {label}
          </div>
        </div>
      ))}
    </>
  );
}

function Moods() {
  return (
    <>
      <Paper />
      <Head
        n="02"
        label="THE FACE"
        title="See what your agent is doing."
        sub="Thinking, working, done, learned, asleep: at a glance."
        style={{ left: 150, top: 70 }}
        size={80}
      />
      <Tiles items={MOODS} />
    </>
  );
}

function Talk() {
  const { width: w, height: h } = useVideoConfig();
  const cam: Camera = { cx: SCREEN.w / 2, cy: 120, z: 3.7, roll: 0 };
  const eye = at(cam, SCREEN.w / 2 + 196 / 2 + 37 * 0.85, 37, w, h);
  return (
    <>
      <MacStage
        cam={cam}
        notch={<NotchCharm s={charm({ face: "listening", swell: 1.08 })} />}
      />
      <Leader
        p={1}
        from={{ x: 1300, y: 470 }}
        to={{ x: eye.x, y: eye.y + 14 }}
        title="LISTENING"
        note="THE EYES SWELL WITH YOUR VOICE"
        align="left"
      />
      <Head
        n="03"
        label="ONE KEY"
        title="Hold ⌥ Space. Talk."
        sub="From any app. The mic is on only while the key is down."
        style={{ left: 150, top: 640 }}
        size={104}
      />
      <div style={{ position: "absolute", right: 170, top: 840 }}>
        <TalkKeys down={1} />
      </div>
    </>
  );
}

function NeedsYou() {
  const cam: Camera = { cx: SCREEN.w / 2, cy: 160, z: 2.9, roll: 0 };
  return (
    <>
      <MacStage
        cam={cam}
        notch={
          <NotchCharm
            s={charm({
              face: "ask",
              open: 1,
              panel: 212,
              ring: 1,
              text: "Run the migration on production?",
              hint: "HOLD · YES     PRESS · NO",
            })}
          />
        }
      />
      <Head
        n="04"
        label="IT NEEDS YOU"
        title="Orange means it needs you."
        sub="Hold for yes, press for no. The only orange on the screen."
        style={{ left: 150, top: 800 }}
        size={84}
      />
    </>
  );
}

function Agents() {
  return (
    <>
      <Paper />
      <Head
        n="05"
        label="ANY AGENT"
        title="Bring the agent you already run."
        sub="Or any ACP or OpenAI-compatible agent. One at a time."
        style={{ left: 150, top: 70 }}
        size={80}
      />
      <Tiles
        items={AGENTS.map(([name, c, f]) => [name, c, f, name.toUpperCase()])}
      />
    </>
  );
}

function Body() {
  const white = colour("white");
  return (
    <>
      <Paper />
      <div
        style={{
          position: "absolute",
          left: 470,
          top: 34,
          width: 1920,
          height: 1080,
        }}
      >
        <Charm3D
          pose={{
            rotY: -0.42,
            rotX: 0.1,
            y: 0,
            scale: 0.96,
            colour: white,
            glyphs: { face: face("happy"), colour: white, t: 900 },
          }}
        />
      </div>
      <Head
        n="06"
        label="OPEN HARDWARE"
        title="Next: a body you can hold."
        sub="Print the shell, build the charm yourself. 46.8 mm, one key, a 480 × 480 screen."
        style={{ left: 150, top: 380 }}
        size={88}
      />
    </>
  );
}

const STILLS = [Hero, Moods, Talk, NeedsYou, Agents, Body];

export function Still({ index }: { index: number }) {
  const Scene = STILLS[index] ?? Hero;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Scene />
      <Sheet frame={0} from={-100} />
      <Address />
    </div>
  );
}

export const STILL_COUNT = STILLS.length;
