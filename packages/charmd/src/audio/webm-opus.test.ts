import { describe, expect, it } from "vitest";

import { WebmOpusReader, readWebmOpus } from "./webm-opus";

function el(id: number[], body: Buffer, unknownSize = false): Buffer {
  const size = unknownSize
    ? Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
    : Buffer.from([0x80 | body.length]);
  return Buffer.concat([Buffer.from(id), size, body]);
}

const simple = (frame: number[]) =>
  el([0xa3], Buffer.from([0x81, 0, 0, 0x80, ...frame]));

describe("WebM Opus", () => {
  it("returns each block's frame in order, through Segment, Cluster and BlockGroup", () => {
    const group = el([0xa0], el([0xa1], Buffer.from([0x81, 0, 1, 0, 9, 9])));
    const cluster = el(
      [0x1f, 0x43, 0xb6, 0x75],
      Buffer.concat([el([0xe7], Buffer.from([0])), simple([1, 2]), group])
    );
    const file = Buffer.concat([
      el([0x1a, 0x45, 0xdf, 0xa3], Buffer.from([0x42, 0x86, 0x81, 0x01])),
      el([0x18, 0x53, 0x80, 0x67], cluster, true),
    ]);
    expect(readWebmOpus(file)).toEqual([
      Buffer.from([1, 2]),
      Buffer.from([9, 9]),
    ]);
  });

  it("refuses laced blocks and files that are cut short", () => {
    const laced = el([0xa3], Buffer.from([0x81, 0, 0, 0x82, 1, 1]));
    expect(() => readWebmOpus(laced)).toThrow(/lacing/);
    expect(() => readWebmOpus(simple([1, 2]).subarray(0, 4))).toThrow(
      /cut short/
    );
    expect(() => readWebmOpus(Buffer.from([0]))).toThrow(/Not a WebM file/);
  });

  it("reads a stream as it arrives, a byte at a time, with the same packets", () => {
    const cluster = el(
      [0x1f, 0x43, 0xb6, 0x75],
      Buffer.concat([simple([1, 2]), simple([3, 4, 5])])
    );
    const file = el([0x18, 0x53, 0x80, 0x67], cluster, true);
    const reader = new WebmOpusReader();
    const packets: Buffer[] = [];
    for (const byte of file) packets.push(...reader.push(Buffer.from([byte])));
    expect(packets).toEqual([Buffer.from([1, 2]), Buffer.from([3, 4, 5])]);
    expect(reader.complete).toBe(true);
  });
});
