import type { ReactNode } from "react";
import { SANS } from "../fonts";
import { NOTCH } from "../charm/notch";

// A MacBook Pro 14" display in points.
export const SCREEN = { w: 1512, h: 982 };
const BEZEL = 16;

const MENU = ["File", "Edit", "View", "Window", "Help"];

function Wallpaper() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(120% 90% at 18% 110%, #d9d4c8 0%, rgba(217,212,200,0) 60%)," +
          "radial-gradient(90% 80% at 90% 0%, #dfe2e6 0%, rgba(223,226,230,0) 65%)," +
          "linear-gradient(180deg, #efeeea 0%, #e6e4de 100%)",
      }}
    >
      {/* the paper grid of opencharm.dev, faint */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(10,10,10,0.045) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(10,10,10,0.045) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
    </div>
  );
}

function MenuBar({ app }: { app: string }) {
  const h = NOTCH.strip;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: SCREEN.w,
        height: h,
        background: "rgba(246,246,244,0.72)",
        display: "flex",
        alignItems: "center",
        font: `500 13.5px/1 ${SANS}`,
        color: "#0A0A0A",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 22,
          paddingLeft: 22,
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: 13,
            height: 13,
            borderRadius: 4,
            background: "#0A0A0A",
          }}
        />
        <span style={{ fontWeight: 700 }}>{app}</span>
        {MENU.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          gap: 18,
          paddingRight: 22,
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: 24,
            height: 11,
            border: "1.5px solid #0A0A0A",
            borderRadius: 3.5,
            padding: 1.5,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "78%",
              height: "100%",
              background: "#0A0A0A",
              borderRadius: 1,
            }}
          />
        </div>
        <span>Tue 6 Oct</span>
        <span>09:41</span>
      </div>
    </div>
  );
}

// The display: wallpaper, menu bar, windows, then the hardware notch and whatever sits by it.
export function MacScreen({
  app = "Terminal",
  children,
  notch,
}: {
  app?: string;
  children?: ReactNode;
  notch?: ReactNode;
}) {
  return (
    <>
      {/* the lid: a black bezel and the aluminium edge around the display */}
      <div
        style={{
          position: "absolute",
          left: -BEZEL,
          top: -BEZEL,
          width: SCREEN.w + BEZEL * 2,
          height: SCREEN.h + BEZEL * 2,
          borderRadius: 30,
          background: "#050505",
          boxShadow: "0 0 0 3px #C9C9C6, 0 0 0 4px #B5B5B2",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: SCREEN.w,
          height: SCREEN.h,
          overflow: "hidden",
          borderRadius: "12px 12px 0 0",
          background: "#000",
        }}
      >
        <Wallpaper />
        <MenuBar app={app} />
        {children}
        <div style={{ position: "absolute", left: SCREEN.w / 2, top: 0 }}>
          {notch}
        </div>
        <div
          style={{
            position: "absolute",
            left: SCREEN.w / 2 - NOTCH.width / 2,
            top: 0,
            width: NOTCH.width,
            height: NOTCH.strip,
            background: "#000",
            borderRadius: "0 0 11px 11px",
          }}
        />
      </div>
    </>
  );
}
