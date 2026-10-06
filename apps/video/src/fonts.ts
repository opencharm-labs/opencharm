import { loadFont } from "@remotion/fonts";
import sans400 from "geist-fonts/geist-sans/Geist-Regular.woff2";
import sans500 from "geist-fonts/geist-sans/Geist-Medium.woff2";
import sans600 from "geist-fonts/geist-sans/Geist-SemiBold.woff2";
import sans700 from "geist-fonts/geist-sans/Geist-Bold.woff2";
import mono400 from "geist-fonts/geist-mono/GeistMono-Regular.woff2";
import mono500 from "geist-fonts/geist-mono/GeistMono-Medium.woff2";
import mono600 from "geist-fonts/geist-mono/GeistMono-SemiBold.woff2";
import mono800 from "geist-fonts/geist-mono/GeistMono-UltraBlack.woff2";

export const SANS = '"Geist", system-ui, sans-serif';
export const MONO = '"Geist Mono", ui-monospace, monospace';

const FILES: [string, string, string][] = [
  ["Geist", sans400, "400"],
  ["Geist", sans500, "500"],
  ["Geist", sans600, "600"],
  ["Geist", sans700, "700"],
  ["Geist Mono", mono400, "400"],
  ["Geist Mono", mono500, "500"],
  ["Geist Mono", mono600, "600"],
  ["Geist Mono", mono800, "800"],
];

// Remotion waits for these before it renders the first frame.
export const fontsReady = Promise.all(
  FILES.map(([family, url, weight]) => loadFont({ family, url, weight }))
);
