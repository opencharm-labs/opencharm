// Speech in, text out; text in, speech out. Audio is always Ogg Opus, the format the charm's
// packets are wrapped in and unwrapped from (src/audio/ogg-opus.ts). Listening and speaking are
// chosen separately (spec 003); a VoiceProvider is the pair a turn uses.

// Speech heard while the key is still down (spec 003): what's said goes out as it comes, so the words
// are ready soon after the key is let go.
type LiveTranscription = {
  // One of the charm's 16 kHz Opus packets.
  push: (frame: Buffer) => void;
  // The whole transcript, once the last of it is heard.
  finish: (signal: AbortSignal) => Promise<string>;
  cancel: () => void;
};
type Listener = {
  name: string;
  transcribe: (ogg: Buffer, signal: AbortSignal) => Promise<string>;
  live?: () => LiveTranscription;
  // Loads what it needs ahead of the first turn (a local model), so that turn isn't the slow one.
  warm?: () => Promise<void>;
};
// A voice the person can pick (spec 003): ElevenLabs lists those in their account.
type VoiceChoice = {
  id: string;
  name: string;
  // An https link to the service's own sample of the voice.
  preview?: string;
  // What the service says about it ("british · female · calm"), when it says anything.
  description?: string;
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
  // A reply is coming soon (the key is down): get ready to speak, e.g. open a connection ahead.
  prime?: () => void;
  // Runs on this computer: slow when busy, but not gone, so no first-audio deadline (voice/speak.ts).
  onDevice?: boolean;
  // The voices this speaker can use, for Settings to show by name.
  voices?: () => Promise<VoiceChoice[]>;
};
type VoiceProvider = {
  name: string;
  transcribe: Listener["transcribe"];
  live?: Listener["live"];
  synthesize: Speaker["synthesize"];
  stream?: Speaker["stream"];
  warm?: () => Promise<void>;
  prime?: Speaker["prime"];
  voices?: Speaker["voices"];
  // The language to fall back on when a transcript or a sentence doesn't show one.
  language?: string;
};

export type {
  Listener,
  LiveTranscription,
  Speaker,
  VoiceChoice,
  VoiceProvider,
};
