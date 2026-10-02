type OpusHead = { channels: number; preSkip: number; inputSampleRate: number };
type WriteOptions = {
  inputSampleRate: number;
  channels?: number;
  serial?: number;
};

// Ogg page flags (RFC 3533; a continued packet is detected from lacing, so no flag is needed to read it) and the Ogg CRC-32 (polynomial 0x04c11db7, no reflection).
const FIRST_PAGE = 0x02;
const LAST_PAGE = 0x04;
const MAX_SEGMENTS = 255;
// libopus' usual encoder lookahead; players trim it from the start (RFC 7845 §4.2).
const DEFAULT_PRE_SKIP = 312;
const VENDOR = "opencharm";
// Opus frame sizes in 48 kHz samples per TOC config (RFC 6716 §3.1): SILK, Hybrid, CELT.
const SILK = [480, 960, 1920, 2880];
const HYBRID = [480, 960];
const CELT = [120, 240, 480, 960];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++)
      r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    table[i] = r >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0;
  for (const byte of data)
    crc = ((crc << 8) ^ (CRC_TABLE[((crc >>> 24) ^ byte) & 0xff] ?? 0)) >>> 0;
  return crc;
}

function lacing(length: number): number[] {
  const segments: number[] = new Array<number>(Math.floor(length / 255)).fill(
    255
  );
  segments.push(length % 255);
  return segments;
}

function page(
  flags: number,
  granule: bigint,
  serial: number,
  sequence: number,
  segments: number[],
  body: Buffer
): Buffer {
  const header = Buffer.alloc(27 + segments.length);
  header.write("OggS", 0, "ascii");
  header.writeUInt8(0, 4);
  header.writeUInt8(flags, 5);
  header.writeBigUInt64LE(granule, 6);
  header.writeUInt32LE(serial, 14);
  header.writeUInt32LE(sequence, 18);
  header.writeUInt8(segments.length, 26);
  Buffer.from(segments).copy(header, 27);
  const out = Buffer.concat([header, body]);
  out.writeUInt32LE(crc32(out), 22);
  return out;
}

function opusPacketSamples48k(packet: Buffer): number {
  const toc = packet[0] ?? 0;
  const config = toc >> 3;
  const frame =
    config < 12
      ? (SILK[config % 4] ?? 0)
      : config < 16
        ? (HYBRID[config % 2] ?? 0)
        : (CELT[config % 4] ?? 0);
  const code = toc & 0x03;
  const frames = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 0x3f : 2;
  return frame * frames;
}

// Speech-to-text APIs want a file, the charm sends bare Opus packets: this puts them in an Ogg Opus
// file (RFC 7845) without decoding anything.
function writeOggOpus(packets: Buffer[], options: WriteOptions): Buffer {
  const serial = options.serial ?? 0x6f636872;
  const head = Buffer.alloc(19);
  head.write("OpusHead", 0, "ascii");
  head.writeUInt8(1, 8);
  head.writeUInt8(options.channels ?? 1, 9);
  head.writeUInt16LE(DEFAULT_PRE_SKIP, 10);
  head.writeUInt32LE(options.inputSampleRate, 12);
  head.writeInt16LE(0, 16);
  head.writeUInt8(0, 18);
  const vendor = Buffer.from(VENDOR, "utf8");
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write("OpusTags", 0, "ascii");
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  tags.writeUInt32LE(0, 12 + vendor.length);

  const pages = [
    page(FIRST_PAGE, 0n, serial, 0, lacing(head.length), head),
    page(0, 0n, serial, 1, lacing(tags.length), tags),
  ];
  let sequence = 2;
  let granule = 0n;
  let segments: number[] = [];
  let bodies: Buffer[] = [];
  const flush = (last: boolean) => {
    pages.push(
      page(
        last ? LAST_PAGE : 0,
        granule,
        serial,
        sequence++,
        segments,
        Buffer.concat(bodies)
      )
    );
    segments = [];
    bodies = [];
  };
  packets.forEach((packet, index) => {
    const laced = lacing(packet.length);
    if (laced.length > MAX_SEGMENTS)
      throw new Error("Opus packet too large for one Ogg page");
    if (segments.length + laced.length > MAX_SEGMENTS) flush(false);
    segments.push(...laced);
    bodies.push(packet);
    granule += BigInt(opusPacketSamples48k(packet));
    if (index === packets.length - 1) flush(true);
  });
  if (packets.length === 0) flush(true);
  return Buffer.concat(pages);
}

// Text-to-speech APIs return Ogg Opus; the charm wants bare packets. Packets may span pages.
function readOggOpus(data: Buffer): { head: OpusHead; packets: Buffer[] } {
  const packets: Buffer[] = [];
  let pending: Buffer[] = [];
  let offset = 0;
  while (offset < data.length) {
    if (data.toString("ascii", offset, offset + 4) !== "OggS")
      throw new Error("Not an Ogg stream (missing OggS page)");
    const count = data.readUInt8(offset + 26);
    const table = data.subarray(offset + 27, offset + 27 + count);
    let cursor = offset + 27 + count;
    for (const size of table) {
      pending.push(data.subarray(cursor, cursor + size));
      cursor += size;
      if (size < 255) {
        packets.push(Buffer.concat(pending));
        pending = [];
      }
    }
    offset = cursor;
  }
  const [headPacket, tagsPacket, ...audio] = packets;
  if (!headPacket || headPacket.toString("ascii", 0, 8) !== "OpusHead")
    throw new Error("Not an Ogg Opus stream (no OpusHead)");
  if (!tagsPacket || tagsPacket.toString("ascii", 0, 8) !== "OpusTags")
    throw new Error("Not an Ogg Opus stream (no OpusTags)");
  return {
    head: {
      channels: headPacket.readUInt8(9),
      preSkip: headPacket.readUInt16LE(10),
      inputSampleRate: headPacket.readUInt32LE(12),
    },
    packets: audio,
  };
}

export { opusPacketSamples48k, readOggOpus, writeOggOpus };
export type { OpusHead, WriteOptions };
