type Rgb = readonly [number, number, number];
type StyleOptions = { color: boolean; trueColor: boolean };
type Style = {
  fg: (hex: string) => string;
  bg: (hex: string) => string;
  bold: (text: string) => string;
  dim: (text: string) => string;
  reset: string;
};

const ESC = "\x1b[";

function channelToCube(value: number): number {
  if (value < 48) return 0;
  if (value < 115) return 1;
  return Math.floor((value - 35) / 40);
}

function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbTo256([r, g, b]: Rgb): number {
  return 16 + 36 * channelToCube(r) + 6 * channelToCube(g) + channelToCube(b);
}

// Piped output, a dumb terminal, NO_COLOR and --no-color all mean plain text: scripts, Emacs shells and screen readers read this CLI too.
function detectStyleOptions(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  isTTY: boolean
): StyleOptions {
  return {
    color:
      isTTY &&
      env.TERM !== "dumb" &&
      !("NO_COLOR" in env) &&
      !argv.includes("--no-color"),
    trueColor: /truecolor|24bit/i.test(env.COLORTERM ?? ""),
  };
}

function createStyle({ color, trueColor }: StyleOptions): Style {
  const paint = (layer: 38 | 48) => (hex: string) => {
    if (!color) return "";
    const rgb = hexToRgb(hex);
    return trueColor
      ? `${ESC}${layer};2;${rgb.join(";")}m`
      : `${ESC}${layer};5;${rgbTo256(rgb)}m`;
  };
  return {
    fg: paint(38),
    bg: paint(48),
    bold: (text) => (color ? `${ESC}1m${text}${ESC}22m` : text),
    dim: (text) => (color ? `${ESC}2m${text}${ESC}22m` : text),
    reset: color ? `${ESC}0m` : "",
  };
}

export { ESC, createStyle, detectStyleOptions, rgbTo256 };
export type { Rgb, Style, StyleOptions };
