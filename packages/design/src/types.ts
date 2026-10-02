type FaceEffect = "cursor" | "spin" | "z" | "ask";

// Field names are short on purpose: the same keys live in charm-face.js and in the firmware's generated header.
type Face = {
  id: string;
  text: string;
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
  fx?: FaceEffect;
};

type Colour = {
  id: string;
  name: string;
  c: string;
  g: string;
  key: string;
};

type AgentState = {
  id: string;
  face: string;
  name: string;
  when: string;
  trigger: string;
};

type FacesData = {
  $comment: string;
  signal: string;
  colours: Colour[];
  faces: Face[];
  states: AgentState[];
  fields: Record<string, string>;
};

export type { AgentState, Colour, Face, FaceEffect, FacesData };
