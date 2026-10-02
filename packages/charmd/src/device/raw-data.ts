import type { RawData } from "ws";

// ws hands over a Buffer, an ArrayBuffer or a list of fragments depending on the frame.
function toBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

export { toBuffer };
