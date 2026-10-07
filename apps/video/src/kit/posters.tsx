import type { ReactNode } from "react";
import { Charm3D } from "../charm/charm-3d";
import { type ColourId, colour, face } from "../charm/engine";
import { Glyph } from "../charm/glyph";
import { NotchCharm, type NotchState } from "../charm/notch";
import { SANS } from "../fonts";
import { MacStage } from "../mac/mac-stage";
import { SCREEN } from "../mac/mac-screen";
import { type Camera } from "../scenes/notch-timeline";
import { TalkKeys } from "../ui/keycaps";
import { Paper, Sheet } from "../ui/sheet";

// Gallery posters, one template: a headline, a line under it, and a card that shows the feature
// large, cut off by the bottom edge. Same canvas as the stills.
export const POSTER = { width: 1920, height: 1149 };

const INK = "#0A0A0A";
const CARD = { left: 210, top: 390, width: 1500, height: 800 };
// The Mac's bezel above the screen, in screen points (mac/mac-screen.tsx).
const BEZEL = 18;

// Little charms floating around the card: [x, y, size, rotation, colour, face].
const SWARM: [number, number, number, number, ColourId, string][] = [
  [140, 90, 80, -10, "lime", "joy"],
  [1780, 84, 76, 9, "lilac", "cute"],
  [118, 600, 100, 8, "cobalt", "curious"],
  [1790, 680, 96, -7, "sun", "wink"],
];

// Function declarations are hoisted, so the list can sit with the constants.
const POSTERS = [CompanionPoster, TalkPoster, AskPoster, BodyPoster];
export const POSTER_COUNT = POSTERS.length;

const charm = (s: Partial<NotchState> & { f: string; c?: ColourId }) => {
  const { f, c, ...rest } = s;
  return {
    open: 1,
    panel: 118,
    ms: 900,
    ...rest,
    face: face(f),
    colour: colour(c ?? "white"),
  } satisfies NotchState;
};

// Inside the card: the Mac's lid at the card's top edge, zoomed in by `z`.
const lidCam = (z: number): Camera => ({
  cx: SCREEN.w / 2 + (POSTER.width / 2 - CARD.width / 2) / z,
  cy: (POSTER.height / 2 - BEZEL * z) / z,
  z,
  roll: 0,
});

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 110,
        textAlign: "center",
        color: INK,
      }}
    >
      <div
        style={{
          font: `600 104px/1.05 ${SANS}`,
          letterSpacing: "-0.05em",
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 24,
          font: `400 40px/1.3 ${SANS}`,
          letterSpacing: "-0.01em",
          color: "#4A4A4A",
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        ...CARD,
        background: "#FFFFFF",
        border: `2px solid ${INK}`,
        borderRadius: 36,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function Swarm() {
  return (
    <>
      {SWARM.map(([x, y, size, rotate, c, f]) => {
        const fc = face(f);
        const g = colour(c).g;
        return (
          <div
            key={`${x}-${y}`}
            style={{
              position: "absolute",
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size,
              background: "#000000",
              borderRadius: size * 0.26,
              transform: `rotate(${rotate}deg)`,
            }}
          >
            <Glyph
              ch={fc.L}
              x={size * 0.32}
              y={size * 0.44}
              size={size * 0.34}
              colour={g}
            />
            <Glyph
              ch={fc.R}
              x={size * 0.68}
              y={size * 0.44}
              size={size * 0.34}
              colour={g}
            />
            {fc.M && (
              <Glyph
                ch={fc.M}
                x={size * 0.5}
                y={size * 0.7}
                size={size * 0.26}
                colour={g}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function CompanionPoster() {
  return (
    <>
      <Head
        title="Meet your agentic companion."
        sub="A face and a voice for the agent you already run."
      />
      <Card>
        <MacStage
          cam={lidCam(3.4)}
          notch={
            <NotchCharm
              s={charm({
                f: "joy",
                c: "lime",
                panel: 142,
                text: "All 48 tests pass. Pushed to main.",
              })}
            />
          }
        />
      </Card>
    </>
  );
}

// Hold the key and talk: the eyes swell with your voice, the keys sit pressed under them.
function TalkPoster() {
  return (
    <>
      <Head
        title="Hold ⌥ Space and talk."
        sub="From any app. It listens, then answers out loud."
      />
      <Card>
        <MacStage
          cam={lidCam(3.4)}
          notch={
            <NotchCharm
              s={charm({ f: "listening", c: "cobalt", open: 0, swell: 1.12 })}
            />
          }
        />
        <div
          style={{
            position: "absolute",
            left: CARD.width / 2 - 311 * 2,
            top: 280,
            transform: "scale(2)",
            transformOrigin: "0 0",
          }}
        >
          <TalkKeys down={1} />
        </div>
      </Card>
    </>
  );
}

// It asks before it acts: the orange question, as big as the card allows.
function AskPoster() {
  return (
    <>
      <Head
        title="Hold for yes. Press for no."
        sub="Orange means your agent needs you."
      />
      <Card>
        <MacStage
          cam={lidCam(3.1)}
          notch={
            <NotchCharm
              s={charm({
                f: "ask",
                panel: 212,
                ring: 1,
                text: "Run the migration on production?",
                hint: "HOLD · YES     PRESS · NO",
              })}
            />
          }
        />
      </Card>
    </>
  );
}

// The printed charm, three shells: white in front, two colours behind it.
function Shell({
  x,
  y,
  scale,
  rotY,
  c,
  f,
}: {
  x: number;
  y: number;
  scale: number;
  rotY: number;
  c: ColourId;
  f: string;
}) {
  const shell = colour(c);
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
          glyphs: { face: face(f), colour: shell, t: 900 },
        }}
      />
    </div>
  );
}

function BodyPoster() {
  const mid = CARD.width / 2;
  return (
    <>
      <Head
        title="Next, a body you can hold."
        sub="Print the shell and build your own charm."
      />
      <Card>
        <Paper />
        <Shell
          x={mid - 470}
          y={380}
          scale={0.82}
          rotY={0.5}
          c="lilac"
          f="cute"
        />
        <Shell
          x={mid + 470}
          y={380}
          scale={0.82}
          rotY={-0.5}
          c="lime"
          f="wink"
        />
        <Shell x={mid} y={400} scale={1.12} rotY={-0.12} c="white" f="happy" />
      </Card>
    </>
  );
}

export function Poster({ index }: { index: number }) {
  const Scene = POSTERS[index] ?? CompanionPoster;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Paper />
      <Scene />
      <Swarm />
      <Sheet frame={0} from={-100} />
    </div>
  );
}
