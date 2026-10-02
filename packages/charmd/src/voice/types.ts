// Speech in, text out; text in, speech out. Audio is always Ogg Opus, the format the charm's
// packets are wrapped in and unwrapped from (src/audio/ogg-opus.ts).
type VoiceProvider = {
  name: string;
  transcribe: (ogg: Buffer, signal: AbortSignal) => Promise<string>;
  synthesize: (text: string, signal: AbortSignal) => Promise<Buffer>;
};

export type { VoiceProvider };
