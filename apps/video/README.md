# The OpenCharm film

A 42-second promo film, made in code with [Remotion](https://www.remotion.dev): the desktop charm by the Mac's notch (what people can install today), the agents it works with, a glimpse of the printed charm to come, and back to the face: the charm in the notch says opencharm.dev itself and winks. Nothing in it is a screen recording: the faces come from the face engine (`packages/design/src/charm-face.js`), the notch layout from the firmware (`firmware/core/src/ui/lvgl_view.cpp`), and the 3D charm from the STL files people print (`hardware/stl/view`).

**Remotion's licence** (`node_modules/remotion/LICENSE.md`) is not open source: it's free for individuals, for-profit organisations with up to 3 employees and non-profits; bigger companies need a company licence. Only this film uses it; nothing OpenCharm ships depends on it.

## Run it

```bash
npm run guide -w @opencharm-labs/video    # a click track at the film's tempo, until the music is in
npm run studio -w @opencharm-labs/video   # edit and scrub in the browser
npm run render -w @opencharm-labs/video   # out/opencharm.mp4, 1920 × 1080, 60 fps
scripts/sheets.sh out/opencharm.mp4       # contact sheets (one frame per beat) for review
```

## Brand kit

`npm run kit -w @opencharm-labs/video` renders the film's resources into `out/kit/`, from the same faces and look:

| File                                | What                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `still-wide-1…6.png`                | 2540 × 1520 stills (1270 × 760 at 2x): the charm, the moods, the key, the question, the agents, the hardware    |
| `poster-wide-1…4.png`               | 2540 × 1520 posters, one template: a headline, a line, the feature large (companion, talk, yes/no, hardware)    |
| `avatar-1…21.png`                   | 1024 × 1024 profile pictures: one face, white on true black, safe for a round crop                              |
| `icon-animated-240.gif`, `-480.gif` | the app icon, alive: a blink, a glance, a wink; it loops. Full-bleed (no white rim), for thumbnails and avatars |
| `clip-square-1…7.mp4`               | 1080 × 1080 cuts of the film, one idea each, silent                                                             |

The kit renders the film first and the square clips play it (copied to `public/film.mp4`, ignored by git), so they always match it; their cuts follow the film's scenes (`CUTS` in `src/track.ts`). The compositions are in `src/kit/`.

## The music

Every cut sits on a beat. The track is licensed, so it never enters git (`public/` audio and `out/` are ignored). Put the file in `public/`, then set `TRACK` in `src/track.ts`: its file name, its tempo and the time of its first downbeat. The cuts move with it.

## Where things are

| File                           | What                                                                     |
| ------------------------------ | ------------------------------------------------------------------------ |
| `src/track.ts`                 | tempo, beats, length                                                     |
| `src/scenes/notch-timeline.ts` | what the charm shows on each beat, and the camera                        |
| `src/scenes/notch-story.tsx`   | the Mac: cold open, hook, moods, hold to talk, the question              |
| `src/scenes/any-agent.tsx`     | the agents it works with                                                 |
| `src/scenes/body.tsx`          | a glimpse of the printed charm, "next"                                   |
| `src/scenes/finale.tsx`        | the face fills the frame, flies home to the notch and says the address   |
| `src/kit/`                     | the brand kit: stills, posters, avatars, the animated icon, square clips |
| `src/charm/`                   | the notch charm, the 3D charm, glyphs, the bridge to the face engine     |
