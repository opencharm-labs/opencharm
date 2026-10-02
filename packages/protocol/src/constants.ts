import { facesData } from "@opencharm-labs/design/faces";

type AudioParams = {
  format: "opus";
  sample_rate: number;
  channels: number;
  frame_duration: number;
};

const PROTOCOL_VERSION = 1;

// Charms that speak our `charm` messages announce it in hello.features; stock XiaoZhi devices don't.
const OPENCHARM_FEATURE = "opencharm";

// Matches upstream xiaozhi-esp32 board configs: the mic side runs at 16 kHz, the speaker side at 24 kHz.
const AUDIO_UP: AudioParams = {
  format: "opus",
  sample_rate: 16000,
  channels: 1,
  frame_duration: 60,
};
const AUDIO_DOWN: AudioParams = {
  format: "opus",
  sample_rate: 24000,
  channels: 1,
  frame_duration: 60,
};

// An Opus packet is at most 1275 bytes; anything far larger on this socket is not audio from a charm.
const LIMITS = {
  maxJsonBytes: 16 * 1024,
  maxAudioFrameBytes: 4 * 1024,
  maxTextChars: 2000,
} as const;

const TIMEOUTS = {
  pairCodeSeconds: 300,
  unpairedIdleSeconds: 120,
  turnSeconds: 60,
} as const;

const FACE_STATES = facesData.states.map((state) => state.id);
// Orange on the screen means only "it needs you" (OPENCHARM.md, the face), so no identity uses it.
const SIGNAL_COLOUR = "#FF5A1F";

export {
  AUDIO_DOWN,
  AUDIO_UP,
  FACE_STATES,
  LIMITS,
  OPENCHARM_FEATURE,
  PROTOCOL_VERSION,
  SIGNAL_COLOUR,
  TIMEOUTS,
};
export type { AudioParams };
