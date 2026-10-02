import { facesData } from "@opencharm-labs/design/faces";
import type { Colour, Face } from "@opencharm-labs/design/types";

// U+FE0E keeps ♥ from turning into an emoji in browsers; terminals render the plain glyph without it.
const VARIATION_SELECTOR = /︎/g;
const DEFAULT_COLOUR_ID = "white";

function glyph(value: string): string {
  return value.replace(VARIATION_SELECTOR, "");
}

function findFace(id: string): Face | undefined {
  const wanted = id.toLowerCase();
  return facesData.faces.find(
    (face) => face.id === id || face.t.toLowerCase() === wanted
  );
}

function randomFace(): Face | undefined {
  return facesData.faces[Math.floor(Math.random() * facesData.faces.length)];
}

function faceText(face: Face): string {
  return glyph(face.text);
}

function pickColour(
  args: readonly string[],
  warn: (message: string) => void
): Colour {
  const flagAt =
    args.indexOf("--colour") >= 0
      ? args.indexOf("--colour")
      : args.indexOf("--color");
  const id =
    flagAt >= 0 ? (args[flagAt + 1] ?? "").toLowerCase() : DEFAULT_COLOUR_ID;
  const found = facesData.colours.find((colour) => colour.id === id);
  if (found) return found;
  const fallback = facesData.colours[0];
  if (!fallback) throw new Error("faces.json has no colours");
  warn(
    `Unknown colour "${id}". Try: ${facesData.colours.map((c) => c.id).join(", ")}. Using white.`
  );
  return fallback;
}

export { faceText, findFace, glyph, pickColour, randomFace };
