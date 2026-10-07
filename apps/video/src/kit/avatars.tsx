import { type ColourId, colour, face, FACES } from "../charm/engine";
import { Glyph } from "../charm/glyph";

// Profile pictures: one face, big, on true black. Kept inside the middle so a round crop loses nothing.
export const AVATAR = { width: 1024, height: 1024 };

// Every face but "ask", whose question mark belongs to the orange ring.
export const AVATARS: [string, ColourId][] = Object.keys(FACES)
  .filter((id) => id !== "ask")
  .map((id) => [id, "white"]);

export function Avatar({ index }: { index: number }) {
  const [id, c] = AVATARS[index] ?? ["joy", "white"];
  const f = face(id);
  const ink = colour(c).g;
  const { width: w } = AVATAR;
  const eyeY = f.M ? w * 0.42 : w * 0.5;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#000000" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `rotate(${f.tilt ?? 0}deg)`,
        }}
      >
        <Glyph ch={f.L} x={w * 0.28} y={eyeY} size={w * 0.46} colour={ink} />
        <Glyph ch={f.R} x={w * 0.72} y={eyeY} size={w * 0.46} colour={ink} />
        {f.M && (
          <Glyph
            ch={f.M}
            x={w * 0.5}
            y={w * 0.7}
            size={w * 0.34}
            colour={ink}
          />
        )}
      </div>
    </div>
  );
}
