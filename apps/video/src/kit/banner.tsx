import { face } from "../charm/engine";
import { Glyph } from "../charm/glyph";

// A header banner: a row of faces on true black, like the charm's own screen.
export const BANNER = { width: 1500, height: 500 };

const ROW = ["happy", "curious", "joy", "doubtful", "cute"];
const INK = "#F4F3EE";

export function Banner() {
  const { width: w, height: h } = BANNER;
  const step = w / ROW.length;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#000000" }}>
      {ROW.map((id, i) => {
        const f = face(id);
        const cx = step * (i + 0.5);
        const eyeY = f.M ? h * 0.44 : h * 0.5;
        return (
          <div
            key={id}
            style={{
              position: "absolute",
              inset: 0,
              transform: `rotate(${f.tilt ?? 0}deg)`,
              transformOrigin: `${cx}px ${h / 2}px`,
            }}
          >
            <Glyph
              ch={f.L}
              x={cx - step * 0.15}
              y={eyeY}
              size={82}
              colour={INK}
            />
            <Glyph
              ch={f.R}
              x={cx + step * 0.15}
              y={eyeY}
              size={82}
              colour={INK}
            />
            {f.M && (
              <Glyph ch={f.M} x={cx} y={h * 0.6} size={62} colour={INK} />
            )}
          </div>
        );
      })}
    </div>
  );
}
