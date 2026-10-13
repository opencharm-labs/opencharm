import OpusScript from "opusscript";

import { readOggOpus, writeOggOpus } from "./ogg-opus";

const FRAME_MS = 60;

// The fake, local and ElevenLabs voices need real encoding; the OpenAI path never decodes audio.
function pcmToOggOpus(
  pcm: Buffer,
  sampleRate: 8000 | 12000 | 16000 | 24000 | 48000
): Buffer {
  const samples = (sampleRate * FRAME_MS) / 1000;
  const frameBytes = samples * 2;
  const encoder = new OpusScript(sampleRate, 1, OpusScript.Application.AUDIO);
  const packets: Buffer[] = [];
  try {
    for (let i = 0; i < pcm.length; i += frameBytes) {
      const frame = Buffer.alloc(frameBytes);
      pcm.copy(frame, 0, i, Math.min(i + frameBytes, pcm.length));
      packets.push(Buffer.from(encoder.encode(frame, samples)));
    }
  } finally {
    encoder.delete();
  }
  return writeOggOpus(packets, { inputSampleRate: sampleRate });
}

function oggOpusToPcm(
  ogg: Buffer,
  sampleRate: 8000 | 12000 | 16000 | 24000 | 48000
): Buffer {
  const decoder = new OpusScript(sampleRate, 1);
  try {
    return Buffer.concat(
      readOggOpus(ogg).packets.map((packet) =>
        Buffer.from(decoder.decode(packet))
      )
    );
  } finally {
    decoder.delete();
  }
}

type OpusEncoder = {
  // 16-bit mono PCM in any chunk size (an odd byte waits for its pair); whole frames come out.
  push: (pcm: Buffer) => Buffer[];
  // The rest, padded with silence to a frame; then the encoder is freed.
  end: () => Buffer[];
};

// For speech that arrives as PCM in pieces (ElevenLabs): Opus packets as soon as a frame is full.
function createOpusEncoder(
  sampleRate: 8000 | 12000 | 16000 | 24000 | 48000
): OpusEncoder {
  const samples = (sampleRate * FRAME_MS) / 1000;
  const frameBytes = samples * 2;
  const encoder = new OpusScript(sampleRate, 1, OpusScript.Application.AUDIO);
  let pending = Buffer.alloc(0);
  let ended = false;
  const frames = (): Buffer[] => {
    const packets: Buffer[] = [];
    while (pending.length >= frameBytes) {
      packets.push(
        Buffer.from(encoder.encode(pending.subarray(0, frameBytes), samples))
      );
      pending = pending.subarray(frameBytes);
    }
    return packets;
  };
  return {
    push(pcm) {
      if (ended) return [];
      pending = Buffer.concat([pending, pcm]);
      return frames();
    },
    end() {
      if (ended) return [];
      ended = true;
      try {
        const whole = pending.length - (pending.length % 2);
        if (whole === 0) return [];
        const last = Buffer.alloc(frameBytes);
        pending.copy(last, 0, 0, whole);
        pending = last;
        return frames();
      } finally {
        encoder.delete();
      }
    },
  };
}

type OpusDecoder = {
  // 16-bit mono PCM for one packet; an undecodable packet gives none.
  decode: (packet: Buffer) => Buffer;
  free: () => void;
};

// For speech that leaves as PCM while it's heard (ElevenLabs' live transcription). Freed once.
function createOpusDecoder(
  sampleRate: 8000 | 12000 | 16000 | 24000 | 48000
): OpusDecoder {
  const decoder = new OpusScript(sampleRate, 1);
  let freed = false;
  return {
    decode(packet) {
      if (freed) return Buffer.alloc(0);
      try {
        return Buffer.from(decoder.decode(packet));
      } catch {
        return Buffer.alloc(0);
      }
    },
    free() {
      if (freed) return;
      freed = true;
      decoder.delete();
    },
  };
}

export { createOpusDecoder, createOpusEncoder, oggOpusToPcm, pcmToOggOpus };
export type { OpusDecoder, OpusEncoder };
