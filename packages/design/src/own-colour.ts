// A colour of your own (spec 014): the glyphs light up in it as it is, so it has to read on true black,
// and it can't pass for the orange that on the screen only means "it needs you" (a bright, saturated
// red-orange to orange, hue 6–40°, so every named orange). The desktop app's Rust keeps the same rule
// (apps/desktop/src-tauri/src/settings.rs).
const OWN_COLOUR = /^#[0-9A-Fa-f]{6}$/;

function linear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

// Why this #RRGGBB can't be a charm's colour, or undefined when it can.
function ownColourProblem(hex: string): string | undefined {
  const [r, g, b] = [1, 3, 5].map(
    (at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255
  ) as [number, number, number];
  const luminance =
    0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  if (luminance < 0.05) return "too dark to see on black";
  const max = Math.max(r, g, b);
  const spread = max - Math.min(r, g, b);
  if (max !== r || max < 0.5 || spread / max < 0.5) return undefined;
  const hue = (60 * (g - b)) / spread;
  return hue >= 6 && hue <= 40
    ? "too close to the orange that means 'it needs you'"
    : undefined;
}

export { OWN_COLOUR, ownColourProblem };
