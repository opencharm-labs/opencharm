import { useLayoutEffect, useRef } from "react";
import { type Colour, type Face, drawGlyphs } from "./engine";

// Pixels per CSS pixel: the kit renders at up to 2x, so the canvas stays sharp.
const RES = 3;

// A face drawn by the engine itself, on true black, so every offset, scale and rotation is the
// product's. The engine centres the face in the box and sizes it from the shorter side.
export function FaceCanvas({
  face,
  colour,
  width,
  height = width,
}: {
  face: Face;
  colour: Colour;
  width: number;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    // t = 1200 ms: mid-breath, and the sleepy face's "z" fully drawn.
    if (ctx)
      drawGlyphs(ctx, width * RES, height * RES, { face, colour, t: 1200 });
  }, [face, colour, width, height]);
  return (
    <canvas
      ref={ref}
      width={width * RES}
      height={height * RES}
      style={{ display: "block", width, height }}
    />
  );
}
