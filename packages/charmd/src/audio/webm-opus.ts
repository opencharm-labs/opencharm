// The Opus packets inside a WebM file, in order: what Microsoft's voice sends (voice/microsoft.ts).
// Just enough Matroska to find the audio blocks: walk the EBML elements, step into the Segment,
// Clusters and BlockGroups, and take each block's frame. No lacing: one frame per block, as Opus in
// WebM is written. It reads a whole file, or a stream as it arrives (WebmOpusReader).
type Vint = { value: number; length: number; unknown: boolean };
type Parsed = { packets: Buffer[]; consumed: number };

const SEGMENT = 0x18538067;
const CLUSTER = 0x1f43b675;
const BLOCK_GROUP = 0xa0;
const BLOCK = 0xa1;
const SIMPLE_BLOCK = 0xa3;
const CONTAINERS = new Set([SEGMENT, CLUSTER, BLOCK_GROUP]);

class CutShort extends Error {}

// An EBML variable-length integer; IDs keep their length marker, sizes don't.
function readVint(data: Buffer, offset: number, keepMarker: boolean): Vint {
  const first = data[offset];
  if (first === undefined) throw new CutShort();
  if (first === 0) throw new Error("Not a WebM file: bad element header");
  const length = Math.clz32(first) - 23;
  if (offset + length > data.length) throw new CutShort();
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    const byte = data[offset + i]!;
    value = value * 256 + byte;
    allOnes &&= byte === 0xff;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

function frameOf(block: Buffer): Buffer {
  const track = readVint(block, 0, false);
  const flags = block[track.length + 2];
  if (flags === undefined) throw new Error("Not a WebM file: empty block");
  if (flags & 0x06) throw new Error("WebM lacing isn't supported");
  return block.subarray(track.length + 3);
}

// Reads whole elements from the start of `data`; stops before one that hasn't fully arrived.
function parse(data: Buffer): Parsed {
  const packets: Buffer[] = [];
  let offset = 0;
  while (offset < data.length) {
    let id: Vint;
    let size: Vint;
    try {
      id = readVint(data, offset, true);
      size = readVint(data, offset + id.length, false);
    } catch (error) {
      if (error instanceof CutShort) break;
      throw error;
    }
    const body = offset + id.length + size.length;
    // A container (even one of unknown size, as a live stream writes them) is stepped into.
    if (CONTAINERS.has(id.value)) {
      offset = body;
      continue;
    }
    if (size.unknown)
      throw new Error("Not a WebM file: an element of unknown size");
    const end = body + size.value;
    if (end > data.length) break;
    if (id.value === SIMPLE_BLOCK || id.value === BLOCK) {
      const frame = frameOf(data.subarray(body, end));
      if (frame.length) packets.push(frame);
    }
    offset = end;
  }
  return { packets, consumed: offset };
}

function readWebmOpus(data: Buffer): Buffer[] {
  const { packets, consumed } = parse(data);
  if (consumed < data.length) throw new Error("Not a WebM file: cut short");
  return packets;
}

// For a stream: push each chunk as it arrives and get the packets it completed.
class WebmOpusReader {
  #pending = Buffer.alloc(0);

  push(chunk: Buffer): Buffer[] {
    this.#pending = Buffer.concat([this.#pending, chunk]);
    const { packets, consumed } = parse(this.#pending);
    this.#pending = this.#pending.subarray(consumed);
    return packets;
  }

  // True when nothing is left half-read.
  get complete(): boolean {
    return this.#pending.length === 0;
  }
}

export { WebmOpusReader, readWebmOpus };
