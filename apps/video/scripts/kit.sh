#!/bin/sh
# The brand kit, rendered into out/kit/: wide stills and posters (2540 × 1520), avatars, the animated icon (GIF, 240 and
# 480 px), the organisation's animated banner (GIF, 1600 × 500) and square clips (1080 × 1080). Run from apps/video
# (npm run kit). Needs ffmpeg.
set -e
mkdir -p out/kit
# A fresh film every time: the square clips play it, so a stale one would put old frames in them.
npx remotion render src/index.ts film out/opencharm.mp4
cp out/opencharm.mp4 public/film.mp4
# Bundle once (public/ and the film with it), then render everything from that bundle.
npx remotion bundle src/index.ts --out-dir out/bundle
# Every still in the kit, by its id: the list comes from the bundle, so it follows src/kit/.
for id in $(npx remotion compositions out/bundle -q); do
  case "$id" in
    still-wide-* | poster-wide-*) npx remotion still out/bundle "$id" "out/kit/$id.png" --scale=1.32292 ;;
    avatar-*) npx remotion still out/bundle "$id" "out/kit/$id.png" ;;
  esac
done
# The icon from lossless PNG frames, so the GIF's small palette holds only real colours.
rm -rf out/icon-frames
npx remotion render out/bundle icon-animated out/icon-frames --sequence --image-format=png
for size in 240 480; do
  ffmpeg -loglevel error -y -framerate 30 -i out/icon-frames/element-%03d.png \
    -vf "scale=$size:$size:flags=lanczos,split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse=dither=none" \
    -loop 0 "out/kit/icon-animated-$size.gif"
done
# The GitHub organisation's banner (github.com/opencharm-labs/.github, profile/assets/), the same way.
rm -rf out/banner-frames
npx remotion render out/bundle banner-animated out/banner-frames --sequence --image-format=png
ffmpeg -loglevel error -y -framerate 30 -i out/banner-frames/element-%03d.png \
  -vf "scale=1600:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
  -loop 0 out/kit/banner-animated.gif
for i in 1 2 3 4 5 6 7; do
  npx remotion render out/bundle "clip-square-$i" "out/kit/clip-square-$i.mp4"
done
ls -la out/kit
