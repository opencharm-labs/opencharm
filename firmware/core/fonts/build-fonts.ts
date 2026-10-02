// Converts Geist Mono (SIL OFL) into LVGL bitmap fonts for charm-core. Run after changing faces or
// sizes: npm run firmware:fonts. Sizes are for the 480 px screen class (see firmware/README.md).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

type FacesJson = { faces: Array<{ L: string; R: string; M?: string }> };

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const OUT = join(HERE, "..", "src", "ui", "fonts");
const EXTRA_BOLD = join(HERE, "GeistMono-ExtraBold.ttf");
const MEDIUM = join(HERE, "GeistMono-Medium.ttf");
const SYMBOLS = join(HERE, "NotoSansSymbols2-Regular.ttf");
const HEART = 0x2665;

function faceGlyphs(): string {
  const { faces } = JSON.parse(
    readFileSync(join(ROOT, "packages", "design", "faces.json"), "utf8")
  ) as FacesJson;
  const chars = new Set<string>(["−", "z", "o", "O"]);
  for (const face of faces)
    for (const part of [face.L, face.R, face.M ?? ""])
      for (const ch of part.replace(/︎/g, "")) chars.add(ch);
  chars.delete(String.fromCodePoint(HEART));
  return [...chars].join("");
}

function convert(
  name: string,
  size: number,
  fonts: Array<{ file: string; symbols?: string; range?: string }>
): void {
  const args = [
    "--no-compress",
    "--no-prefilter",
    "--bpp",
    "4",
    "--size",
    String(size),
    "--format",
    "lvgl",
    "--lv-include",
    "lvgl.h",
  ];
  for (const font of fonts) {
    // Paths relative to the repo: they're written into the generated file's header.
    args.push("--font", relative(ROOT, font.file));
    if (font.symbols) args.push("--symbols", font.symbols);
    if (font.range) args.push("--range", font.range);
  }
  args.push("-o", relative(ROOT, join(OUT, `${name}.c`)));
  execFileSync(join(ROOT, "node_modules", ".bin", "lv_font_conv"), args, {
    cwd: ROOT,
    stdio: "inherit",
  });
  console.log(`wrote firmware/core/src/ui/fonts/${name}.c`);
}

const eyes = faceGlyphs();
const withHeart = (size: number) => [
  { file: EXTRA_BOLD, symbols: eyes },
  { file: SYMBOLS, range: `0x${HEART.toString(16)}` },
];
convert("charm_eyes_163", 163, withHeart(163));
convert("charm_eyes_95", 95, withHeart(95));
convert("charm_eyes_57", 57, withHeart(57));
convert("charm_digits_80", 80, [{ file: EXTRA_BOLD, symbols: "0123456789 " }]);
// Latin-1 plus the punctuation agents like to use, for spoken lines and hints.
const TEXT_RANGE =
  "0x20-0x7E,0xA0-0xFF,0x2013-0x2014,0x2018-0x201D,0x2022,0x2026,0x2212";
convert("charm_text_35", 35, [{ file: MEDIUM, range: TEXT_RANGE }]);
convert("charm_text_24", 24, [{ file: MEDIUM, range: TEXT_RANGE }]);
