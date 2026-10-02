// The charm counts text limits in UTF-8 bytes (C++ strlen); so do we, or an accented question that
// fits in characters would be dropped on the device.
const encoder = new TextEncoder();
const ELLIPSIS = "…";

function utf8Length(text: string): number {
  return encoder.encode(text).length;
}

// Cut to at most maxBytes, on a character boundary, ending with "…" when cut.
function fitUtf8(text: string, maxBytes: number): string {
  if (utf8Length(text) <= maxBytes) return text;
  const budget = maxBytes - utf8Length(ELLIPSIS);
  let out = "";
  let used = 0;
  for (const char of text) {
    const size = utf8Length(char);
    if (used + size > budget) break;
    out += char;
    used += size;
  }
  return out + ELLIPSIS;
}

export { fitUtf8, utf8Length };
