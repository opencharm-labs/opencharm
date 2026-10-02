import OpusScript from "opusscript";

import { readOggOpus, writeOggOpus } from "./ogg-opus";

const FRAME_MS = 60;

// Only the fake and local voices need real encoding; the OpenAI path never decodes audio.
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

export { oggOpusToPcm, pcmToOggOpus };
