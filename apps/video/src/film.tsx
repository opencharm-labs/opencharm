import { AbsoluteFill, Audio, Sequence } from "remotion";
import { Body } from "./scenes/body";
import { AnyAgent } from "./scenes/any-agent";
import { Finale } from "./scenes/finale";
import { NotchStory } from "./scenes/notch-story";
import { DURATION, beat, trackSrc } from "./track";

// The whole film: the notch (what people can get now), the agents, a glimpse of the body to come,
// and back to the face, which ends it.
export function Film() {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Sequence durationInFrames={beat(60)}>
        <NotchStory />
      </Sequence>
      <Sequence from={beat(60)} durationInFrames={beat(68) - beat(60)}>
        <AnyAgent />
      </Sequence>
      <Sequence from={beat(68)} durationInFrames={beat(75) - beat(68)}>
        <Body />
      </Sequence>
      <Sequence from={beat(75)} durationInFrames={DURATION - beat(75)}>
        <Finale />
      </Sequence>
      <Audio src={trackSrc()} />
    </AbsoluteFill>
  );
}
