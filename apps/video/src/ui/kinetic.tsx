import type { CSSProperties } from "react";
import { SANS } from "../fonts";
import { out, span } from "../motion";

export type Word = { text: string; at: number };

// Words rise into place from behind a mask, each on its own frame, and leave together.
export function Kinetic({
  frame,
  words,
  leave,
  size,
  style,
  colour = "#0A0A0A",
  align = "left",
}: {
  frame: number;
  words: Word[];
  leave?: number;
  size: number;
  style?: CSSProperties;
  colour?: string;
  align?: "left" | "center";
}) {
  const gone = leave == null ? 0 : span(frame, leave, leave + 14, out);
  if (gone >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start",
        columnGap: size * 0.26,
        font: `600 ${size}px/1.04 ${SANS}`,
        letterSpacing: "-0.045em",
        color: colour,
        ...style,
      }}
    >
      {words.map((w) => {
        const p = span(frame, w.at, w.at + 16, out);
        return (
          <span
            key={w.at + w.text}
            style={{
              display: "inline-block",
              overflow: "hidden",
              paddingBottom: size * 0.12,
            }}
          >
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${(1 - p + gone) * 110}%)`,
              }}
            >
              {w.text}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// "A B C" placed from a start frame, one word per step.
export const wordsFrom = (text: string, at: number, step: number): Word[] =>
  text.split(" ").map((t, i) => ({ text: t, at: at + i * step }));
