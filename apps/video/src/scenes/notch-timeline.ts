import { type ColourId, colour, face, flapAt } from "../charm/engine";
import { NOTCH, type NotchState } from "../charm/notch";
import { SCREEN } from "../mac/mac-screen";
import { type Line } from "../mac/terminal";
import { FPS, beat, beatAt } from "../track";
import { keys, rand, snap, step } from "../motion";

type Beat = {
  b: number;
  face?: string;
  colour?: ColourId;
  open?: number;
  panel?: number;
  text?: string;
  hint?: string;
  ring?: number;
  speak?: boolean;
  // the mood's name and what it means, for the note on the drawing
  note?: [string, string];
};

export type Camera = { cx: number; cy: number; z: number; roll: number };

const LINE_PANEL = 118;
const TWO_LINES = 142;
const FULL = NOTCH.panel;
const HINT = "HOLD · YES     PRESS · NO";

// What the charm shows, beat by beat. Each entry changes only what it names.
const SCRIPT: Beat[] = [
  { b: 0, face: "neutral", colour: "white", open: 0, panel: LINE_PANEL },
  { b: 15, face: "happy" },
  {
    b: 16,
    face: "focused",
    open: 1,
    text: "Running the tests…",
    note: ["WORKING", "A TOOL OR A LONG TASK IS RUNNING"],
  },
  {
    b: 18,
    face: "strain",
    text: "3 failing. Trying again.",
    note: ["STUCK", "RETRIES ARE PILING UP"],
  },
  {
    b: 20,
    face: "joy",
    colour: "cobalt",
    text: "All 48 pass. Pushed.",
    note: ["DONE", "ONE LINE, THEN BACK TO THE FACE"],
  },
  {
    b: 26,
    face: "learned",
    colour: "lime",
    panel: TWO_LINES,
    text: "Learned how you deploy.",
    note: ["LEARNED", "IT MADE OR IMPROVED A SKILL"],
  },
  {
    b: 28,
    face: "wink",
    colour: "lilac",
    panel: LINE_PANEL,
    text: "Noted: you like pnpm.",
    note: ["NOTED", "IT SAVED SOMETHING ABOUT YOU"],
  },
  {
    b: 30,
    face: "money",
    colour: "sun",
    text: "$20 spent today.",
    note: ["COST", "SPEND PASSED A LIMIT YOU SET"],
  },
  {
    b: 32,
    face: "sleepy",
    colour: "coal",
    open: 0,
    text: "",
    note: ["ASLEEP", "THE AGENT KEEPS RUNNING"],
  },
  { b: 35, face: "neutral", colour: "white", note: ["", ""] },
  { b: 37, face: "listening" },
  { b: 41, face: "thinking" },
  {
    b: 44,
    face: "happy",
    open: 1,
    text: "Shipped. Staging is green.",
    speak: true,
  },
  { b: 48, face: "joy" },
  { b: 50, face: "neutral", open: 0, text: "" },
  {
    b: 52,
    face: "ask",
    open: 1,
    panel: FULL,
    ring: 1,
    text: "Run the migration on production?",
    hint: HINT,
  },
  { b: 56, face: "joy", ring: 0, panel: LINE_PANEL, hint: "", text: "On it." },
  { b: 58, face: "happy" },
];

// When the key is down (the talk key, then the "yes" hold on the question).
export const KEY_DOWN: [number, number][] = [
  [37, 41],
  [55, 56],
];

const PANEL_FRAMES = 17; // the desktop app's 0.28 s panel animation
const panelEase = (t: number): number => {
  // cubic-bezier(0.2, 0.9, 0.25, 1.1): quick, with a small overshoot
  const u = 1 - t;
  return 3 * u * u * t * 0.9 + 3 * u * t * t * 1.1 + t * t * t;
};

function latest<K extends keyof Beat>(
  frame: number,
  key: K
): { value: Beat[K]; at: number; prev: Beat[K] } {
  let value: Beat[K] = undefined as Beat[K];
  let prev: Beat[K] = undefined as Beat[K];
  let at = 0;
  for (const e of SCRIPT) {
    if (e[key] === undefined) continue;
    if (beat(e.b) > frame) break;
    prev = value;
    value = e[key];
    at = beat(e.b);
  }
  return { value, at, prev };
}

function animated(frame: number, key: "open" | "panel" | "ring"): number {
  const { value, at, prev } = latest(frame, key);
  const t = Math.min(1, (frame - at) / PANEL_FRAMES);
  const from = (prev as number | undefined) ?? (value as number) ?? 0;
  return from + (((value as number) ?? 0) - from) * panelEase(t);
}

// Blinks every few seconds, never on the same frame from run to run.
function blinking(frame: number): boolean {
  let at = 40;
  for (let i = 0; at < frame + 1; i++) {
    if (frame >= at && frame < at + 7) return true;
    at += Math.round((2.4 + rand(i) * 3.2) * FPS);
  }
  return false;
}

export function voiceLevel(frame: number): number {
  const t = frame / FPS;
  const syllables = Math.abs(Math.sin(t * 13.1) * Math.sin(t * 5.3 + 1));
  return Math.min(1, syllables * (0.7 + 0.3 * rand(Math.floor(frame / 4))));
}

// The mood on screen named on the drawing, and when it changed (to draw its leader again).
export function noteAt(frame: number): { note?: [string, string]; at: number } {
  const n = latest(frame, "note");
  return { note: n.value?.[0] ? n.value : undefined, at: n.at };
}

export function charmAt(frame: number): NotchState {
  const ms = (frame / FPS) * 1000;
  const faceId = latest(frame, "face");
  const f = face(faceId.value ?? "neutral");
  const sinceFace = frame - faceId.at;
  const pop =
    faceId.at === 0
      ? 1
      : 1 - 0.22 * Math.exp(-sinceFace / 5) * Math.cos(sinceFace / 2.4);
  const text = latest(frame, "text");
  const speaking = latest(frame, "speak");
  const typedMs = ((frame - text.at) / FPS) * 1000;
  const shown = Math.floor(typedMs / 32);
  const typing = (text.value ?? "").length > shown;
  const listening = faceId.value === "listening";
  return {
    face: f,
    colour: colour(latest(frame, "colour").value ?? "white"),
    open: animated(frame, "open"),
    panel: animated(frame, "panel"),
    ring: animated(frame, "ring"),
    text: text.value || undefined,
    shown,
    hint: latest(frame, "hint").value || undefined,
    flap:
      speaking.value && text.at === speaking.at && typing ? flapAt(ms) : null,
    blink: f.fx !== "z" && blinking(frame),
    look: lookAt(frame),
    swell: listening ? 1 + 0.25 * voiceLevel(frame) : 1,
    pop,
    cursorOn: Math.floor(ms / 500) % 2 === 0,
    ms,
  };
}

// Where the eyes look: down at the terminal while you watch it, otherwise small glances.
export function lookAt(frame: number): { x: number; y: number } {
  const scripted = step<{ x: number; y: number } | null>(frame, [
    [0, null],
    [beat(12.5), { x: -0.9, y: 1 }],
    [beat(14), null],
  ]);
  if (scripted) return scripted;
  const i = Math.floor(frame / 95);
  return { x: (rand(i) * 2 - 1) * 0.6, y: (rand(i + 99) * 2 - 1) * 0.4 };
}

export const WIDE: Camera = { cx: SCREEN.w / 2, cy: 354, z: 1.1, roll: 0 };
const CLOSE: Camera = { cx: SCREEN.w / 2, cy: 96, z: 4.2, roll: 0 };
const EAR = NOTCH.width / 2 + NOTCH.strip * 0.85;
const TALK: Camera = { cx: SCREEN.w / 2, cy: 92, z: 2.9, roll: 0 };

const SHOTS: [number, Camera, number][] = [
  // [beat, camera, beats to get there]
  [0, WIDE, 0],
  [13.5, { ...WIDE, z: WIDE.z * 1.04, cy: WIDE.cy - 10 }, 5.5],
  [15.5, CLOSE, 1.5],
  [18, { ...CLOSE, z: 4.7, cy: 92, roll: -1.2 }, 0.4],
  [20, { ...CLOSE, z: 3.9, roll: 0.8 }, 0.4],
  [26, { ...CLOSE, z: 4.4 }, 0],
  [28, { ...CLOSE, z: 4.0, cx: CLOSE.cx - 14, roll: -1 }, 0.4],
  [30, { ...CLOSE, z: 4.6, cx: CLOSE.cx + 10, roll: 1 }, 0.4],
  [32, { ...CLOSE, z: 4.0, roll: 0 }, 0.4],
  [35.5, TALK, 1.5],
  [41, { ...TALK, z: 3.2, cy: 80 }, 4],
  [45, { ...TALK, z: 3.5, cy: 100 }, 1.5],
  [50.5, TALK, 1.5],
  [52.5, { ...CLOSE, z: 3.0, cy: 130 }, 1],
  [56, { ...CLOSE, z: 3.4, cy: 120 }, 3.5],
];

export function cameraAt(frame: number): Camera {
  let cam = SHOTS[0]![1];
  for (let i = 1; i < SHOTS.length; i++) {
    const [b, target, length] = SHOTS[i]!;
    const end = beat(b);
    const start = end - Math.max(1, beat(length) - beat(0));
    if (frame < start) break;
    const p = keys(
      frame,
      [
        [start, 0],
        [end, 1],
      ],
      snap
    );
    cam = {
      cx: cam.cx + (target.cx - cam.cx) * p,
      cy: cam.cy + (target.cy - cam.cy) * p,
      z: Math.exp(Math.log(cam.z) + (Math.log(target.z) - Math.log(cam.z)) * p),
      roll: cam.roll + (target.roll - cam.roll) * p,
    };
  }
  // While the moods go by, the camera kicks a little on every beat.
  if (frame >= beat(16) && frame < beat(32)) {
    const { since } = beatAt(frame);
    cam = { ...cam, z: cam.z * (1 + 0.03 * Math.exp(-since / 6)) };
  }
  return cam;
}

// A point on the Mac screen, in output pixels.
export function toOutput(
  cam: Camera,
  x: number,
  y: number
): { x: number; y: number } {
  const dx = (x - cam.cx) * cam.z;
  const dy = (y - cam.cy) * cam.z;
  const r = (cam.roll * Math.PI) / 180;
  return {
    x: 960 + dx * Math.cos(r) - dy * Math.sin(r),
    y: 540 + dx * Math.sin(r) + dy * Math.cos(r),
  };
}

export const notchEyes = (cam: Camera) => ({
  left: toOutput(cam, SCREEN.w / 2 - EAR, NOTCH.strip / 2),
  right: toOutput(cam, SCREEN.w / 2 + EAR, NOTCH.strip / 2),
  size: NOTCH.strip * 1.05 * cam.z,
});

export const TERMINAL: Line[] = [
  {
    at: beat(8.5),
    text: "~/shop ❯ fix the rounding bug in checkout",
    tone: "cmd",
  },
  { at: beat(10), text: "● Reading src/checkout/cart.ts", tone: "dim" },
  { at: beat(11), text: "● Editing src/checkout/cart.ts  +14 −3", tone: "dim" },
  { at: beat(12), text: "● Running npm test", tone: "dim" },
  { at: beat(13), text: "  ✓ 48 passed", tone: "ok" },
  { at: beat(14), text: "● git push origin fix/cart-rounding", tone: "dim" },
];
