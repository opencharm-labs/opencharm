type Wav = { sampleRate: number; channels: number; pcm: Buffer };

function writeWav(pcm: Buffer, sampleRate: number, channels = 1): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// Reads 16-bit PCM WAV, walking chunks because macOS `say` adds chunks before "data".
function readWav(data: Buffer): Wav {
  if (
    data.toString("ascii", 0, 4) !== "RIFF" ||
    data.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Not a WAV file");
  }
  let offset = 12;
  let format:
    { channels: number; sampleRate: number; bits: number } | undefined;
  while (offset + 8 <= data.length) {
    const id = data.toString("ascii", offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      format = {
        channels: data.readUInt16LE(body + 2),
        sampleRate: data.readUInt32LE(body + 4),
        bits: data.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      if (!format || format.bits !== 16)
        throw new Error("Only 16-bit PCM WAV is supported");
      return {
        sampleRate: format.sampleRate,
        channels: format.channels,
        pcm: data.subarray(body, body + size),
      };
    }
    offset = body + size + (size % 2);
  }
  throw new Error("WAV file has no data chunk");
}

export { readWav, writeWav };
export type { Wav };
