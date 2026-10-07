import { type ColourId, colour, face, FACES } from "../charm/engine";
import { FaceCanvas } from "../charm/face-canvas";

// Profile pictures: one face, big, on true black. Kept inside the middle so a round crop loses nothing.
export const AVATAR = { width: 1024, height: 1024 };

// The engine's face fills a third of its box; drawn 1.3x larger and cropped, it fills the picture.
const ZOOM = 1.3;

// Every face but "ask", whose question mark belongs to the orange ring.
export const AVATARS: [string, ColourId][] = Object.keys(FACES)
  .filter((id) => id !== "ask")
  .map((id) => [id, "white"]);

export function Avatar({ index }: { index: number }) {
  const [id, c] = AVATARS[index] ?? ["joy", "white"];
  const size = AVATAR.width * ZOOM;
  const inset = (AVATAR.width - size) / 2;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#000000",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", left: inset, top: inset }}>
        <FaceCanvas face={face(id)} colour={colour(c)} width={size} />
      </div>
    </div>
  );
}
