import { AbsoluteFill, Audio, Sequence } from "remotion";
import { Body } from "./scenes/body";
import { AnyAgent } from "./scenes/any-agent";
import { NotchStory } from "./scenes/notch-story";
import { DURATION, beat, trackSrc } from "./track";

// The whole film: the notch (what people can get now), the agents, then the body to come.
export function Film() {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Sequence durationInFrames={beat(60)}>
        <NotchStory />
      </Sequence>
      <Sequence from={beat(60)} durationInFrames={beat(68) - beat(60)}>
        <AnyAgent />
      </Sequence>
      <Sequence from={beat(68)} durationInFrames={DURATION - beat(68)}>
        <Body />
      </Sequence>
      <Audio src={trackSrc()} />
    </AbsoluteFill>
  );
}
