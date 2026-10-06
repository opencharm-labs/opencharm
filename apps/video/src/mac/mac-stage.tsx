import type { ReactNode } from "react";
import { type Camera } from "../scenes/notch-timeline";
import { Paper } from "../ui/sheet";
import { MacScreen } from "./mac-screen";

// The Mac on the drawing paper, seen through the camera.
export function MacStage({
  cam,
  notch,
  shake = 0,
  children,
}: {
  cam: Camera;
  notch: ReactNode;
  shake?: number;
  children?: ReactNode;
}) {
  return (
    <>
      <Paper />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transformOrigin: "0 0",
          transform: `translate(960px, ${540 + shake}px) rotate(${cam.roll}deg) scale(${cam.z}) translate(${-cam.cx}px, ${-cam.cy}px)`,
        }}
      >
        <MacScreen notch={notch}>{children}</MacScreen>
      </div>
    </>
  );
}
