import type { ReactNode } from "react";
import { NOTCH } from "../charm/notch";
import { SANS } from "../fonts";

// A MacBook Pro 14" display in points, drawn like the hero on opencharm.dev: an ink outline, a black
// band along the top, a white screen.
export const SCREEN = { w: 1512, h: 982 };
const BEZEL = 18;
const SIDE = 10;

const MENU = ["File", "Edit", "View", "Window", "Help"];

function MenuBar({ app }: { app: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: SCREEN.w,
        height: NOTCH.strip,
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid rgb(10 10 10 / 0.22)",
        font: `500 15px/1 ${SANS}`,
        color: "#0A0A0A",
      }}
    >
      <div style={{ display: "flex", gap: 24, paddingLeft: 26 }}>
        <span style={{ fontWeight: 600 }}>{app}</span>
        {MENU.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div style={{ marginLeft: "auto", paddingRight: 26 }}>Tue 6 Oct 9:41</div>
    </div>
  );
}

// The display: the lid, the menu bar, windows, then the notch and whatever sits by it.
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
      <div
        style={{
          position: "absolute",
          left: -SIDE,
          top: -BEZEL,
          width: SCREEN.w + SIDE * 2,
          height: SCREEN.h + BEZEL + SIDE,
          borderRadius: 30,
          background: "#FFFFFF",
          border: "2px solid #0A0A0A",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        <div style={{ height: BEZEL - 2, background: "#0A0A0A" }} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: SCREEN.w,
          height: SCREEN.h,
          overflow: "hidden",
          background: "#FFFFFF",
        }}
      >
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
