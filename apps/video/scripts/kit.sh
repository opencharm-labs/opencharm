#!/bin/sh
# The brand kit, rendered into out/kit/: wide stills (2540 × 1520), the animated icon (GIF, 240 and
# 480 px) and square clips (1080 × 1080). Run from apps/video (npm run kit). Needs ffmpeg.
set -e
mkdir -p out/kit
# The square clips play the rendered film, so it's rendered first and copied where they read it.
[ -f out/opencharm.mp4 ] || npx remotion render src/index.ts film out/opencharm.mp4 --crf=16
cp out/opencharm.mp4 public/film.mp4
for i in 1 2 3 4 5 6; do
  npx remotion still src/index.ts "still-wide-$i" "out/kit/still-wide-$i.png" --scale=1.32292
done
npx remotion render src/index.ts icon-animated out/kit/icon-animated.mov --codec=prores --prores-profile=4444
for size in 240 480; do
  ffmpeg -loglevel error -y -i out/kit/icon-animated.mov \
    -vf "scale=$size:$size:flags=lanczos,split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse=dither=none" \
    -loop 0 "out/kit/icon-animated-$size.gif"
done
rm out/kit/icon-animated.mov
for i in 1 2 3 4 5 6; do
  npx remotion render src/index.ts "clip-square-$i" "out/kit/clip-square-$i.mp4" --crf=18
done
ls -la out/kit
