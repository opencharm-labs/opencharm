// The film draws faces with OpenCharm's own face engine, so every glyph, offset and colour is the
// product's, not a copy.
import "@opencharm-labs/design/charm-face.js";

export type Face = {
  t: string;
  L: string;
  R: string;
  M?: string;
  gx?: number;
  gy?: number;
  dy?: number;
  dl?: number;
  dr?: number;
  rl?: number;
  rr?: number;
  sl?: number;
  sr?: number;
  tilt?: number;
  fx?: "cursor" | "spin" | "z" | "ask";
};

export type Colour = {
  id: string;
  name: string;
  c: string;
  g: string;
  key: string;
};

export type GlyphState = {
  face: Face;
  colour: Colour;
  blink?: boolean;
  look?: { x: number; y: number };
  cursorOn?: boolean;
  flap?: string | null;
  pop?: number;
  voice?: number;
  t?: number;
};

type Engine = {
  FACES: Record<string, Face>;
  COLORS: Colour[];
  SIGNAL: string;
  drawGlyphs: (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    s: GlyphState
  ) => void;
};

// The firmware's mouth while it speaks: these glyphs, 110 ms each.
const FLAP = ["o", "−", "O", "o", "−"];

const charm = (window as unknown as { CharmFace: Engine }).CharmFace;

export const FACES = charm.FACES;
export const SIGNAL = charm.SIGNAL;
export const drawGlyphs = charm.drawGlyphs;

export type ColourId = "white" | "cobalt" | "lime" | "lilac" | "sun" | "coal";
export const colour = (id: ColourId): Colour =>
  charm.COLORS.find((c) => c.id === id) ?? (charm.COLORS[0] as Colour);
export const face = (id: string): Face => FACES[id] ?? (FACES.neutral as Face);

export const flapAt = (ms: number): string =>
  FLAP[Math.floor(ms / 110) % FLAP.length] as string;
