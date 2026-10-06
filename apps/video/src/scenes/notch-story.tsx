import { useCurrentFrame } from "remotion";
import { colour, face } from "../charm/engine";
import { NOTCH, NotchCharm, notchPanelHeight } from "../charm/notch";
import { MacScreen, SCREEN } from "../mac/mac-screen";
import { Terminal } from "../mac/terminal";
import { out, rand, snap, span, step } from "../motion";
import { beat } from "../track";
import { Kinetic, wordsFrom } from "../ui/kinetic";
import { Leader, Paper, Sheet } from "../ui/sheet";
import { TalkKeys } from "../ui/keycaps";
import { BIG_EYES, type Eyes, FULL_FRAME, Morph, type Rect } from "../ui/morph";
import { MoodGrid } from "./mood-grid";
import {
  type Camera,
  KEY_DOWN,
  TERMINAL,
  WIDE,
  cameraAt,
  charmAt,
  noteAt,
  notchEyes,
  toOutput,
} from "./notch-timeline";

// Where the eyes go when the panel takes the whole frame (the agents scene).
export const AGENT_EYES: Eyes = {
  lx: 960 - 150,
  ly: 330,
  rx: 960 + 150,
  ry: 330,
  size: 230,
};

const B = (n: number) => beat(n);

function panelRect(cam: Camera, frame: number): Rect {
  const s = charmAt(frame);
  const tl = toOutput(cam, SCREEN.w / 2 - NOTCH.wide / 2, 0);
  const h = notchPanelHeight(s) * cam.z;
  return {
    x: tl.x,
    y: tl.y,
    w: NOTCH.wide * cam.z,
    h,
    r: (s.open > 0.5 ? 30 : NOTCH.strip / 2) * cam.z,
  };
}

const eyesOf = (cam: Camera): Eyes => {
  const e = notchEyes(cam);
  return {
    lx: e.left.x,
    ly: e.left.y,
    rx: e.right.x,
    ry: e.right.y,
    size: e.size,
  };
};

function ColdOpen({ frame }: { frame: number }) {
  if (frame >= B(8)) return null;
  const p = span(frame, B(6), B(8), snap);
  const eyesOpen = frame >= B(2);
  const look = step(frame, [
    [0, { x: 0, y: 0 }],
    [B(4), { x: -1, y: 0.2 }],
    [B(5), { x: 1, y: 0.2 }],
    [B(5.75), { x: 0, y: 0 }],
  ]);
  const blink = !eyesOpen || (frame >= B(3.5) && frame < B(3.5) + 7);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {frame < B(1) ? (
        <div style={{ position: "absolute", inset: 0, background: "#000" }} />
      ) : (
        <Morph
          p={p}
          from={FULL_FRAME}
          to={panelRect(WIDE, B(8))}
          eyesFrom={BIG_EYES}
          eyesTo={eyesOf(WIDE)}
          face={face("neutral")}
          colour={colour("white")}
          blink={blink}
          look={p > 0 ? { x: 0, y: 0 } : look}
        />
      )}
    </div>
  );
}

function ToBlack({ frame }: { frame: number }) {
  if (frame < B(58)) return null;
  const p = span(frame, B(58), B(60), snap);
  const cam = cameraAt(B(58));
  return (
    <Morph
      p={p}
      from={panelRect(cam, B(58))}
      to={FULL_FRAME}
      eyesFrom={eyesOf(cam)}
      eyesTo={AGENT_EYES}
      face={face("happy")}
      colour={colour("white")}
    />
  );
}

function keyDown(frame: number): number {
  for (const [a, b] of KEY_DOWN) {
    if (frame >= B(a) && frame < B(b)) return span(frame, B(a), B(a) + 4);
    if (frame >= B(b) && frame < B(b) + 6)
      return 1 - span(frame, B(b), B(b) + 6);
  }
  return 0;
}

const TITLES: [number, string][] = [
  [0, "01 · YOUR AGENT"],
  [B(16), "02 · ITS FACE"],
  [B(35), "03 · HOLD TO TALK"],
  [B(52), "04 · IT NEEDS YOU"],
];

// The notes on the drawing: what the charm is, what each mood means, where the talk key is.
function Notes({ frame, cam }: { frame: number; cam: Camera }) {
  const eye = notchEyes(cam).left;
  const panelBottom = toOutput(cam, 0, notchPanelHeight(charmAt(frame))).y;
  const intro = span(frame, B(9), B(9) + 24, out) - span(frame, B(13), B(13.5));
  const { note, at } = noteAt(frame);
  const mood =
    note && frame < B(35) && !(frame >= B(22) && frame < B(26))
      ? span(frame, at, at + 16, out)
      : 0;
  const key =
    span(frame, B(36.5), B(36.5) + 20, out) - span(frame, B(40.5), B(41));
  return (
    <>
      <Leader
        p={intro}
        from={{ x: 640, y: 250 }}
        to={{ x: eye.x, y: eye.y + 26 }}
        title="THE DESKTOP CHARM"
        note="MACOS · WINDOWS"
      />
      {note && (
        <Leader
          key={at}
          p={mood}
          from={{ x: 560, y: 900 }}
          to={{ x: eye.x, y: panelBottom + 10 }}
          title={note[0]}
          note={note[1]}
        />
      )}
      <Leader
        p={key}
        from={{ x: 1330, y: 905 }}
        to={{ x: 1272, y: 930 }}
        title="THE TALK KEY"
        note="⌥ SPACE · IN ANY APP"
        align="left"
      />
    </>
  );
}

// Everything that happens on the Mac, from the cold open to the moment the panel fills the frame.
export function NotchStory() {
  const frame = useCurrentFrame();
  const cam = cameraAt(frame);
  const s = charmAt(frame);
  const morphing = frame < B(8) || frame >= B(58);
  const termOut = span(frame, B(33), B(34.5), snap);
  const keysIn = Math.max(
    span(frame, B(35.5), B(36), out) - span(frame, B(50), B(50.5)),
    0
  );
  const keysAgain = Math.max(
    span(frame, B(54.5), B(55), out) - span(frame, B(57), B(57.5)),
    0
  );
  const shake =
    frame >= B(15) && frame < B(15) + 10 ? (rand(frame) - 0.5) * 6 : 0;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
      }}
    >
      <Paper />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transformOrigin: "0 0",
          transform: `translate(960px, ${540 + shake}px) rotate(${cam.roll}deg) scale(${cam.z}) translate(${-cam.cx}px, ${-cam.cy}px)`,
        }}
      >
        <MacScreen notch={<NotchCharm s={{ ...s, noEyes: morphing }} />}>
          <div
            style={{
              transform: `translateY(${termOut * 900}px)`,
              opacity: 1 - termOut,
            }}
          >
            <Terminal
              frame={frame}
              lines={TERMINAL}
              x={790}
              y={190}
              w={630}
              h={480}
            />
          </div>
        </MacScreen>
      </div>

      <Notes frame={frame} cam={cam} />

      {/* The hook */}
      <Kinetic
        frame={frame}
        words={wordsFrom("Your agent works all day.", B(8.5), 10)}
        leave={B(11.75)}
        size={96}
        style={{ left: 200, top: 380, width: 820 }}
      />
      <Kinetic
        frame={frame}
        words={wordsFrom("You never see it.", B(12), 8)}
        leave={B(14)}
        size={96}
        style={{ left: 200, top: 430, width: 820 }}
      />
      <Kinetic
        frame={frame}
        words={wordsFrom("Give it a face.", B(14.25), 7)}
        leave={B(16)}
        size={150}
        align="center"
        style={{ left: 0, right: 0, top: 640 }}
      />

      {/* Hold to talk */}
      <Kinetic
        frame={frame}
        words={wordsFrom("Hold to talk.", B(35.5), 6)}
        leave={B(37)}
        size={110}
        align="center"
        style={{ left: 0, right: 0, top: 520 }}
      />
      <Kinetic
        frame={frame}
        words={wordsFrom("“Ship the fix to staging.”", B(37.25), 16)}
        leave={B(43)}
        size={84}
        align="center"
        style={{ left: 0, right: 0, top: 560 }}
      />
      <Kinetic
        frame={frame}
        words={wordsFrom("Orange means it needs you.", B(52.5), 7)}
        leave={B(54.5)}
        size={84}
        align="center"
        style={{ left: 0, right: 0, top: 820 }}
      />
      {(keysIn > 0 || keysAgain > 0) && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 860,
            display: "flex",
            justifyContent: "center",
            transform: `translateY(${(1 - Math.max(keysIn, keysAgain)) * 260}px)`,
          }}
        >
          <TalkKeys down={keyDown(frame)} />
        </div>
      )}

      {frame >= B(22) && frame < B(26) && (
        <MoodGrid frame={frame} from={B(22)} />
      )}
      <Sheet
        frame={frame}
        from={B(8)}
        title={step(frame, TITLES)}
        shift={cam.cy * cam.z}
      />
      <ColdOpen frame={frame} />
      <ToBlack frame={frame} />
    </div>
  );
}
