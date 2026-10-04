// Speech in, text out; text in, speech out. Audio is always Ogg Opus, the format the charm's
// packets are wrapped in and unwrapped from (src/audio/ogg-opus.ts). Listening and speaking are
// chosen separately (spec 003); a VoiceProvider is the pair a turn uses.
type Listener = {
  name: string;
  transcribe: (ogg: Buffer, signal: AbortSignal) => Promise<string>;
  // Loads what it needs ahead of the first turn (a local model), so that turn isn't the slow one.
  warm?: () => Promise<void>;
};
type Speaker = {
  name: string;
  // `language` is the reply's two-letter code; a speaker with one voice ignores it.
  synthesize: (
    text: string,
    signal: AbortSignal,
    language?: string
  ) => Promise<Buffer>;
  // Opus packets as they're made, so playback starts before the sentence is done (voice/packets.ts).
  stream?: (
    text: string,
    signal: AbortSignal,
    language?: string
  ) => AsyncIterable<Buffer>;
  warm?: () => Promise<void>;
  // Runs on this computer: slow when busy, but not gone, so no first-audio deadline (voice/speak.ts).
  onDevice?: boolean;
};
type VoiceProvider = {
  name: string;
  transcribe: Listener["transcribe"];
  synthesize: Speaker["synthesize"];
  stream?: Speaker["stream"];
  warm?: () => Promise<void>;
  // The language to fall back on when a transcript or a sentence doesn't show one.
  language?: string;
};

export type { Listener, Speaker, VoiceProvider };
