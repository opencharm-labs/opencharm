import { CameraMotionBlur } from "@remotion/motion-blur";
import type { ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import { Body } from "./scenes/body";
import { AnyAgent } from "./scenes/any-agent";
import { Finale } from "./scenes/finale";
import { NotchStory } from "./scenes/notch-story";
import { CUTS, DURATION, beat, trackSrc } from "./track";

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
export function Film() {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Sequence durationInFrames={beat(CUTS.agents)}>
        <Blur>
          <NotchStory />
        </Blur>
      </Sequence>
      <Sequence
        from={beat(CUTS.agents)}
        durationInFrames={beat(CUTS.body) - beat(CUTS.agents)}
      >
        <Blur>
          <AnyAgent />
        </Blur>
      </Sequence>
      <Sequence
        from={beat(CUTS.body)}
        durationInFrames={beat(CUTS.finale) - beat(CUTS.body)}
      >
        <Body />
      </Sequence>
      <Sequence
        from={beat(CUTS.finale)}
        durationInFrames={DURATION - beat(CUTS.finale)}
      >
        <Blur>
          <Finale />
        </Blur>
      </Sequence>
      <Audio src={trackSrc()} />
    </AbsoluteFill>
  );
}
