import { OffthreadVideo, staticFile } from "remotion";
import { BEATS, CUTS, beat } from "../track";
import { Paper, Sheet } from "../ui/sheet";
import { Address, Head } from "./layout";

export const CLIP = { width: 1080, height: 1080 };
const SCALE = 1000 / 1920;

// Square cuts of the film, one idea each: [from beat, to beat, number, label, title]. The scene
// cuts come from the film's own (CUTS), so a re-cut film moves them too.
export const CLIPS: [number, number, string, string, string][] = [
  [0, 16, "01", "OPENCHARM", "Give your agent a face."],
  [15.5, 33, "02", "THE FACE", "See what your agent is doing."],
  [35, 51, "03", "ONE KEY", "Hold ⌥ Space. Talk."],
  [51, CUTS.agents, "04", "IT NEEDS YOU", "Orange means it needs you."],
  [
    CUTS.agents,
    CUTS.body,
    "05",
    "ANY AGENT",
    "Bring the agent you already run.",
  ],
  [CUTS.body, CUTS.finale, "06", "OPEN HARDWARE", "Next: a body you can hold."],
  [CUTS.finale - 0.5, BEATS, "07", "OPENCHARM.DEV", "Your agent. Its face."],
];

export const clipFrames = (index: number): number => {
  const c = CLIPS[index] ?? CLIPS[0]!;
  return beat(c[1]) - beat(c[0]);
};

export function Clip({ index }: { index: number }) {
  const [from, , n, label, title] = CLIPS[index] ?? CLIPS[0]!;
  const top = 1080 - 140 - 1080 * SCALE;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Paper />
      <Sheet frame={0} from={-100} />
      <Head
        n={n}
        label={label}
        title={title}
        style={{ left: 90, top: 80 }}
        size={72}
      />
      <div
        style={{
          position: "absolute",
          left: 40 - 1.5,
          top: top - 1.5,
          width: 1000 + 3,
          height: 1080 * SCALE + 3,
          border: "1.5px solid #0A0A0A",
          boxSizing: "border-box",
        }}
      />
      {/* The rendered film (npm run kit copies it into public/), so every clip matches it frame for frame. */}
      <OffthreadVideo
        src={staticFile("film.mp4")}
        trimBefore={beat(from)}
        muted
        style={{
          position: "absolute",
          left: 40,
          top,
          width: 1000,
          height: 1080 * SCALE,
        }}
      />
      <Address />
    </div>
  );
}
