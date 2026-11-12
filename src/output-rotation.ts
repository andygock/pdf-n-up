import type { OutputSheet } from "./types.ts";

// PDF /Rotate changes the displayed coordinate system. Keep preview overlays
// and print dimensions in that same system while leaving PDF artwork intact.
export function rotateOutputSheet(
  sheet: OutputSheet,
  rotation: number,
): OutputSheet {
  let result = sheet;
  for (let angle = 0; angle < rotation; angle += 90) {
    const { outputWidth, outputHeight, edges } = result;
    result = {
      ...result,
      outputWidth: outputHeight,
      outputHeight: outputWidth,
      boxes: result.boxes.map((box) => ({
        x: box.y,
        y: outputWidth - box.x - box.width,
        width: box.height,
        height: box.width,
      })),
      edges: edges && {
        top: edges.left,
        right: edges.top,
        bottom: edges.right,
        left: edges.bottom,
        horizontal: edges.vertical,
        vertical: edges.horizontal,
      },
    };
  }
  return result;
}
