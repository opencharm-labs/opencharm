#!/bin/sh
# Contact sheets of a render for review: one frame per beat, 12 beats a sheet (sheet0 = beats 0-11).
# Usage: scripts/sheets.sh out/draft.mp4 [frame offset within the beat, at 60 fps]
set -e
in="$1"; off="${2:-20}"; dir="$(dirname "$in")/sheet"
rm -rf "$dir"; mkdir -p "$dir"
ffmpeg -loglevel error -i "$in" -vf "select='eq(mod(n\,30)\,$off)',scale=480:270" -fps_mode vfr "$dir/f%03d.png"
n=$(ls "$dir" | wc -l)
i=0
while [ $((i*12)) -lt "$n" ]; do
  ffmpeg -loglevel error -y -framerate 1 -start_number $((i*12+1)) -i "$dir/f%03d.png" -vf "tile=4x3" -frames:v 1 "$dir/sheet$i.png"
  i=$((i+1))
done
ls "$dir"/sheet*
