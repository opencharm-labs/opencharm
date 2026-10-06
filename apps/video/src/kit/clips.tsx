import { OffthreadVideo, staticFile } from "remotion";
import { beat } from "../track";
import { Paper, Sheet } from "../ui/sheet";
import { Address, Head } from "./layout";

export const CLIP = { width: 1080, height: 1080 };

// Square cuts of the film, one idea each: [from beat, to beat, number, label, title].
export const CLIPS: [number, number, string, string, string][] = [
  [0, 16, "01", "OPENCHARM", "Give your agent a face."],
  [15.5, 33, "02", "THE FACE", "See what your agent is doing."],
  [35, 51, "03", "ONE KEY", "Hold ⌥ Space. Talk."],
  [51, 59.5, "04", "IT NEEDS YOU", "Orange means it needs you."],
  [59.5, 68, "05", "ANY AGENT", "Bring the agent you already run."],
  [68, 84, "06", "OPEN HARDWARE", "Then a body you can hold."],
];

export const clipFrames = (index: number): number => {
  const c = CLIPS[index] ?? CLIPS[0]!;
  return beat(c[1]) - beat(c[0]);
};

const SCALE = 1000 / 1920;

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
        startFrom={beat(from)}
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
