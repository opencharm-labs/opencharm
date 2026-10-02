import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentState, Colour, Face, FacesData } from "./types";

type EngineFace = Omit<Face, "id" | "text">;
type CharmFaceEngine = {
  SIGNAL: string;
  COLORS: Colour[];
  ORDER: string[];
  FACES: Record<string, EngineFace>;
  STATES: AgentState[];
  faceString: (face: EngineFace) => string;
};
type EngineWindow = {
  CharmFace?: CharmFaceEngine;
  matchMedia: () => { matches: boolean };
};

const ENGINE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "charm-face.js"
);
const COMMENT =
  "Generated from packages/design/src/charm-face.js by packages/design/scripts/export-faces.ts. Edit the JS, then run npm run design:export.";
const FIELDS: Record<string, string> = {
  L: "left eye glyph",
  R: "right eye glyph",
  M: "mouth glyph (optional)",
  gx: "gaze x, fraction of screen",
  gy: "gaze y, fraction of screen",
  dy: "move eyes down, fraction",
  dl: "move left eye down, fraction",
  dr: "move right eye down, fraction",
  rl: "rotate left eye, degrees",
  rr: "rotate right eye, degrees",
  sl: "scale left eye",
  sr: "scale right eye",
  tilt: "rotate whole face, degrees",
  fx: "cursor | spin | z | ask",
};

function loadEngine(): CharmFaceEngine {
  const source = readFileSync(ENGINE_PATH, "utf8");
  const fakeWindow: EngineWindow = { matchMedia: () => ({ matches: false }) };
  // The engine is a browser IIFE that attaches to window; running it against a stub keeps one source of truth.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  new Function("window", source)(fakeWindow);
  if (!fakeWindow.CharmFace) {
    throw new Error("charm-face.js did not define window.CharmFace");
  }
  return fakeWindow.CharmFace;
}

function buildFacesData(): FacesData {
  const engine = loadEngine();
  return {
    $comment: COMMENT,
    signal: engine.SIGNAL,
    colours: engine.COLORS,
    faces: engine.ORDER.map((id) => {
      const face = engine.FACES[id];
      if (!face)
        throw new Error(`charm-face.js ORDER lists unknown face ${id}`);
      return { id, text: engine.faceString(face), ...face };
    }),
    states: engine.STATES,
    fields: FIELDS,
  };
}

function serializeFacesData(data: FacesData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export { buildFacesData, serializeFacesData };
