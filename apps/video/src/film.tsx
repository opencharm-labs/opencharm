import { CameraMotionBlur } from "@remotion/motion-blur";
import type { ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import { Body } from "./scenes/body";
import { AnyAgent } from "./scenes/any-agent";
import { Finale } from "./scenes/finale";
import { NotchStory } from "./scenes/notch-story";
import { DURATION, beat, trackSrc } from "./track";

// A film camera's blur on everything that moves: a 180° shutter, six samples a frame. Not on the
// 3D scene, which would draw six WebGL scenes a frame.
function Blur({ children }: { children: ReactNode }) {
  return (
    <CameraMotionBlur shutterAngle={180} samples={6}>
      {children}
    </CameraMotionBlur>
  );
}

// The whole film: the notch (what people can get now), the agents, a glimpse of the body to come,
// and back to the face, which ends it.
export function Film({ muted = false }: { muted?: boolean }) {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Sequence durationInFrames={beat(60)}>
        <Blur>
          <NotchStory />
        </Blur>
      </Sequence>
      <Sequence from={beat(60)} durationInFrames={beat(68) - beat(60)}>
        <Blur>
          <AnyAgent />
        </Blur>
      </Sequence>
      <Sequence from={beat(68)} durationInFrames={beat(75) - beat(68)}>
        <Body />
      </Sequence>
      <Sequence from={beat(75)} durationInFrames={DURATION - beat(75)}>
        <Blur>
          <Finale />
        </Blur>
      </Sequence>
      {!muted && <Audio src={trackSrc()} />}
    </AbsoluteFill>
  );
}
