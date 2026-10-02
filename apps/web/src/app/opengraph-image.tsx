import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { ImageResponse } from "next/og";

export const alt =
  "OpenCharm: the app icon, a white charm with a black screen and a ^ ^ face";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The site's own type, from Vercel's geist package (OFL): ImageResponse can't read the WOFF2 files
// next/font serves, so it gets the TTFs. Read once, at build time.
const fonts = join(
  dirname(
    createRequire(join(process.cwd(), "package.json")).resolve(
      "geist/font/sans"
    )
  ),
  "fonts"
);
const sans = readFile(join(fonts, "geist-sans/Geist-SemiBold.ttf"));
const mono = readFile(join(fonts, "geist-mono/GeistMono-SemiBold.ttf"));

// The share card is the app icon on the site's off-white paper; built at build time.
export default async function OpengraphImage() {
  const icon = await readFile(join(process.cwd(), "public/icon-512.png"));
  const src = `data:image/png;base64,${icon.toString("base64")}`;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 64,
        background: "#F6F6F4",
        color: "#0A0A0A",
        fontFamily: "Geist",
      }}
    >
      <img
        src={src}
        width={320}
        height={320}
        alt=""
        style={{ borderRadius: "22.37%", border: "1px solid #D4D4D4" }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            fontFamily: "Geist Mono",
            fontSize: 40,
            letterSpacing: 8,
            fontWeight: 600,
          }}
        >
          OPENCHARM
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 600,
            lineHeight: 1,
            maxWidth: 620,
            letterSpacing: -2,
          }}
        >
          Meet your agentic companion
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Geist", data: await sans, weight: 600, style: "normal" },
        { name: "Geist Mono", data: await mono, weight: 600, style: "normal" },
      ],
    }
  );
}
