import { staticFile } from "remotion";

// Every cut in the film is placed on a beat of the track. Swap in the real track by dropping it
// in public/ and setting its file, tempo and the time of its first downbeat; the cuts follow.
export const FPS = 60;
export const TRACK = {
  file: "guide.wav",
  bpm: 120,
  firstBeat: 0,
};
export const BEATS = 84;

export const beat = (n: number): number =>
  Math.round((TRACK.firstBeat + (n * 60) / TRACK.bpm) * FPS);

// Which beat a frame is in, and how many frames into it: exact at any tempo, where a fixed number
// of frames per beat would drift.
export function beatAt(frame: number): { index: number; since: number } {
  const index = Math.floor(((frame / FPS - TRACK.firstBeat) * TRACK.bpm) / 60);
  return { index, since: frame - beat(index) };
}
export const DURATION = beat(BEATS);
export const trackSrc = (): string => staticFile(TRACK.file);
