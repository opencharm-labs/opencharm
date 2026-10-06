import { Easing, interpolate } from "remotion";

export type Key = [frame: number, value: number];

// A value through keyframes; each segment eased (default: smooth in and out).
export function keys(
  frame: number,
  points: Key[],
  easing: (t: number) => number = Easing.bezier(0.65, 0, 0.35, 1)
): number {
  return interpolate(
    frame,
    points.map((p) => p[0]),
    points.map((p) => p[1]),
    { easing, extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
}

// 0 → 1 between two frames.
export const span = (
  frame: number,
  from: number,
  to: number,
  easing: (t: number) => number = Easing.bezier(0.65, 0, 0.35, 1)
): number =>
  keys(
    frame,
    [
      [from, 0],
      [to, 1],
    ],
    easing
  );

export const snap = Easing.bezier(0.85, 0, 0.15, 1);
export const out = Easing.bezier(0.16, 1, 0.3, 1);
export const back = Easing.bezier(0.34, 1.56, 0.64, 1);

// The last value at or before this frame, for things that switch rather than move.
export function step<T>(frame: number, points: [number, T][]): T {
  let current = (points[0] as [number, T])[1];
  for (const [at, value] of points) if (frame >= at) current = value;
  return current;
}

// A deterministic pseudo-random number in [0, 1) for a seed.
export const rand = (seed: number): number => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
