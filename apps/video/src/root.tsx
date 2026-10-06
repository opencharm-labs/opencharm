import { Composition, continueRender, delayRender } from "remotion";
import { Film } from "./film";
import { fontsReady } from "./fonts";
import { DURATION, FPS } from "./track";

const waiting = delayRender("Loading Geist");
void fontsReady.then(() => continueRender(waiting));

export function Root() {
  return (
    <Composition
      id="film"
      component={Film}
      durationInFrames={DURATION}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
}
