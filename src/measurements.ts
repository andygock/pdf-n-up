import type { Measurements } from "./types.ts";

const mm = (points: number) =>
  `${Number(((points * 25.4) / 72).toFixed(2))} mm`;

// Draw only onto the preview canvas; generated PDF bytes are never changed.
export function drawMeasurements(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  measurements: Measurements,
) {
  const sx = width / measurements.outputWidth;
  const sy = height / measurements.outputHeight;
  const fontSize = Math.max(11, Math.min(18, width / 45));
  context.save();
  context.font = `600 ${fontSize}px "IBM Plex Sans", sans-serif`;
  context.textBaseline = "top";
  const label = (text: string, x: number, y: number) => {
    const textWidth = context.measureText(text).width;
    const left = Math.max(0, Math.min(x, width - textWidth - 8));
    const top = Math.max(0, Math.min(y, height - fontSize - 8));
    context.fillStyle = "rgba(255,255,255,0.92)";
    context.fillRect(left, top, textWidth + 8, fontSize + 8);
    context.fillStyle = "#176b63";
    context.fillText(text, left + 4, top + 4);
  };
  const box = measurements.boxes[0];
  if (box) {
    const x = box.x * sx;
    const y = (measurements.outputHeight - box.y - box.height) * sy;
    label(
      `Copy: ${mm(box.width)} × ${mm(box.height)}`,
      x,
      y + (box.height * sy) / 2,
    );
  }
  const edges = measurements.edges;
  label(
    edges
      ? `Margins T/R/B/L: ${[edges.top, edges.right, edges.bottom, edges.left].map(mm).join(" / ")}`
      : `Min. margin: ${mm(measurements.margin)} \u00b7 Cell gap: ${mm(measurements.gutter)}`,
    4,
    4,
  );
  if (edges)
    label(
      `Gaps H/V: ${mm(edges.horizontal)} / ${mm(edges.vertical)}`,
      4,
      fontSize + 16,
    );
  context.restore();
}
