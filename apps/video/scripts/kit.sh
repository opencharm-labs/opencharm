#!/bin/sh
# The brand kit, rendered into out/kit/: wide stills (2540 × 1520), the animated icon (GIF, 240 and
# 480 px) and square clips (1080 × 1080). Run from apps/video (npm run kit). Needs ffmpeg.
set -e
mkdir -p out/kit
# A fresh film every time: the square clips play it, so a stale one would put old frames in them.
npx remotion render src/index.ts film out/opencharm.mp4
cp out/opencharm.mp4 public/film.mp4
# Bundle once (public/ and the film with it), then render everything from that bundle.
npx remotion bundle src/index.ts --out-dir out/bundle
for i in 1 2 3 4 5 6; do
  npx remotion still out/bundle "still-wide-$i" "out/kit/still-wide-$i.png" --scale=1.32292
done
# The icon from lossless PNG frames, so the GIF's small palette holds only real colours.
rm -rf out/icon-frames
npx remotion render out/bundle icon-animated out/icon-frames --sequence --image-format=png
for size in 240 480; do
  ffmpeg -loglevel error -y -framerate 30 -i out/icon-frames/element-%03d.png \
    -vf "scale=$size:$size:flags=lanczos,split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse=dither=none" \
    -loop 0 "out/kit/icon-animated-$size.gif"
done
for i in 1 2 3 4 5 6 7; do
  npx remotion render out/bundle "clip-square-$i" "out/kit/clip-square-$i.mp4"
done
ls -la out/kit
