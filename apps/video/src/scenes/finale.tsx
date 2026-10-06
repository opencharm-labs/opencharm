import { useCurrentFrame } from "remotion";
import { colour, face, flapAt } from "../charm/engine";
import { NotchCharm, type NotchState } from "../charm/notch";
import { MacStage } from "../mac/mac-stage";
import { keys, out, snap, span, step } from "../motion";
import { FPS, beat } from "../track";
import { BIG_EYES, FULL_FRAME, Morph } from "../ui/morph";
import { Sheet } from "../ui/sheet";
import { type Camera, eyesOf, panelRect } from "./notch-timeline";
import { SCREEN } from "../mac/mac-screen";

const ADDRESS = "opencharm.dev";
const PANEL = 118;
const TYPE_MS = 70; // a little slower than speech, so the address lands

const FACES: [number, string][] = [
  [75, "happy"],
  [76, "loved"],
  [76.75, "happy"],
  [80, "joy"],
  [83, "wink"],
];

// The last shot holds still while the panel speaks, then leans in a little.
function cameraAt(frame: number, B: (n: number) => number): Camera {
  return {
    cx: SCREEN.w / 2,
    cy: 62,
    z: keys(
      frame,
      [
        [B(78), 3.9],
        [B(84), 4.3],
      ],
      out
    ),
    roll: 0,
  };
}

// Starts at beat 75 with the face filling the frame: it smiles, loves you back, then flies home to
// the notch, where the charm says the address itself and winks. The last image is the product.
export function Finale() {
  const frame = useCurrentFrame();
  const B = (n: number) => beat(n) - beat(75);
  const cam = cameraAt(frame, B);
  const [faceAt, faceId] = step(
    frame,
    FACES.map((f) => [B(f[0]), f] as [number, [number, string]])
  );
  const f = face(faceId);
  const since = frame - B(faceAt);
  const pop = 1 - 0.22 * Math.exp(-since / 5) * Math.cos(since / 2.4);
  const blink =
    (frame >= B(75.75) && frame < B(75.75) + 7) ||
    (frame >= B(81.25) && frame < B(81.25) + 7);
  const white = colour("white");

  const typedMs = ((frame - B(78)) / FPS) * 1000;
  const shown = Math.max(0, Math.floor(typedMs / TYPE_MS));
  const typing = frame >= B(78) && shown < ADDRESS.length;
  const s: NotchState = {
    face: f,
    colour: white,
    open: 1,
    panel: PANEL,
    text: frame >= B(78) ? ADDRESS : undefined,
    shown,
    flap: typing ? flapAt(typedMs) : null,
    blink,
    pop,
    look: { x: 0, y: 0 },
    ms: (frame / FPS) * 1000,
    noEyes: frame < B(78),
  };

  const land = span(frame, B(77), B(78), snap);
  const landed = cameraAt(B(78), B);
  const big = { ...BIG_EYES, size: BIG_EYES.size * pop };

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <MacStage cam={cam} notch={<NotchCharm s={s} />} />
      <Sheet frame={frame + beat(75)} from={beat(8)} shift={cam.cy * cam.z} />
      {frame < B(78) && (
        <Morph
          p={land}
          from={FULL_FRAME}
          to={panelRect(landed, { open: 1, panel: PANEL })}
          eyesFrom={big}
          eyesTo={eyesOf(landed)}
          face={land > 0 ? face("happy") : f}
          colour={white}
          blink={blink}
        />
      )}
      {/* a quarter beat to black after the wink: the film ends where it began */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#000",
          opacity: span(frame, B(83.75), B(84) - 1),
        }}
      />
    </div>
  );
}
