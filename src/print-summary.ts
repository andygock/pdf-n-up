import { formatPageSize, pointsToMillimetres } from "./format.ts";
import type { OutputSheet } from "./types.ts";

export const formatCopySize = (width: number, height: number) =>
  `${Number(pointsToMillimetres(width).toFixed(2))} \u00d7 ${Number(pointsToMillimetres(height).toFixed(2))} mm`;

export function summarisePrint(sheets: OutputSheet[]) {
  if (!sheets.length) return null;
  const sizes = new Map<
    string,
    { size: string; scale: string; count: number }
  >();
  let copies = 0,
    minScale = Infinity,
    maxScale = 0;
  for (const sheet of sheets) {
    sheet.boxes.forEach((box, index) => {
      const size = formatCopySize(box.width, box.height);
      const scaleValue = sheet.scales[index] * 100;
      const scale = `${Number(scaleValue.toFixed(2))}%`;
      const key = `${size}/${scale}`;
      const entry = sizes.get(key) ?? { size, scale, count: 0 };
      entry.count++;
      sizes.set(key, entry);
      copies++;
      minScale = Math.min(minScale, scaleValue);
      maxScale = Math.max(maxScale, scaleValue);
    });
  }
  const variants = [...sizes.values()];
  const copySizes = new Set(variants.map((item) => item.size));
  return {
    paper: formatPageSize(sheets[0].outputWidth, sheets[0].outputHeight),
    capacity: sheets[0].capacity,
    sheetCount: sheets.length,
    copies,
    variants,
    copySize: copySizes.size === 1 ? variants[0].size : "Varied copy sizes",
    scale:
      Math.abs(maxScale - minScale) < 0.0001
        ? `${Number(minScale.toFixed(2))}%`
        : `${Number(minScale.toFixed(2))}\u2013${Number(maxScale.toFixed(2))}%`,
    unused:
      sheets[sheets.length - 1].capacity -
      sheets[sheets.length - 1].boxes.length,
  };
}
