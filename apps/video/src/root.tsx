import {
  Composition,
  Folder,
  Still as StillComposition,
  continueRender,
  delayRender,
} from "remotion";
import { Film } from "./film";
import { fontsReady } from "./fonts";
import { CLIP, CLIPS, Clip, clipFrames } from "./kit/clips";
import { IconAnimated } from "./kit/icon-animated";
import { STILL, STILL_COUNT, Still } from "./kit/stills";
import { DURATION, FPS } from "./track";

const waiting = delayRender("Loading Geist");
void fontsReady.then(() => continueRender(waiting));

export function Root() {
  return (
    <>
      <Composition
        id="film"
        component={Film}
        durationInFrames={DURATION}
        fps={FPS}
        width={1920}
        height={1080}
      />
      {/* The brand kit: the same faces and look as the film, as stills, square clips and an icon. */}
      <Folder name="kit">
        <Composition
          id="icon-animated"
          component={IconAnimated}
          durationInFrames={4 * 30}
          fps={30}
          width={480}
          height={480}
        />
        {Array.from({ length: STILL_COUNT }, (_, i) => (
          <StillComposition
            key={i}
            id={`still-wide-${i + 1}`}
            component={Still}
            defaultProps={{ index: i }}
            width={STILL.width}
            height={STILL.height}
          />
        ))}
        {CLIPS.map((_, i) => (
          <Composition
            key={i}
            id={`clip-square-${i + 1}`}
            component={Clip}
            defaultProps={{ index: i }}
            durationInFrames={clipFrames(i)}
            fps={FPS}
            width={CLIP.width}
            height={CLIP.height}
          />
        ))}
      </Folder>
    </>
  );
}
