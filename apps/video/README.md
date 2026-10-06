# The OpenCharm film

A 42-second promo film, made in code with [Remotion](https://www.remotion.dev): the desktop charm by the Mac's notch (what people can install today), the agents it works with, then the printed charm and opencharm.dev. Nothing in it is a screen recording: the faces come from the face engine (`packages/design/src/charm-face.js`), the notch layout from the firmware (`firmware/core/src/ui/lvgl_view.cpp`), and the 3D charm from the STL files people print (`hardware/stl/view`).

**Remotion's licence** (`node_modules/remotion/LICENSE.md`) is not open source: it's free for individuals, for-profit organisations with up to 3 employees and non-profits; bigger companies need a company licence. Only this film uses it; nothing OpenCharm ships depends on it.

## Run it

```bash
npm run guide -w @opencharm-labs/video    # a click track at the film's tempo, until the music is in
npm run studio -w @opencharm-labs/video   # edit and scrub in the browser
npm run render -w @opencharm-labs/video   # out/opencharm.mp4, 1920 × 1080, 60 fps
scripts/sheets.sh out/opencharm.mp4       # contact sheets (one frame per beat) for review
```

## The music

Every cut sits on a beat. The track is licensed, so it never enters git (`public/` audio and `out/` are ignored). Put the file in `public/`, then set `TRACK` in `src/track.ts`: its file name, its tempo and the time of its first downbeat. The cuts move with it.

## Where things are

| File                           | What                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| `src/track.ts`                 | tempo, beats, length                                                 |
| `src/scenes/notch-timeline.ts` | what the charm shows on each beat, and the camera                    |
| `src/scenes/notch-story.tsx`   | the Mac: cold open, hook, moods, hold to talk, the question          |
| `src/scenes/any-agent.tsx`     | the agents it works with                                             |
| `src/scenes/body.tsx`          | the printed charm and the end card                                   |
| `src/charm/`                   | the notch charm, the 3D charm, glyphs, the bridge to the face engine |
