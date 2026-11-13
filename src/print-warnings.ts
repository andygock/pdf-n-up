import { getSourceFormat } from "./source-format.ts";
import type { OutputSheet } from "./types.ts";

export function printWarnings(
  sheets: OutputSheet[],
  filename: string,
): string[] {
  const warnings: string[] = [];
  const mm = 72 / 25.4;
  const exceeds = (short: number, long: number) =>
    sheets.some(
      (sheet) =>
        Math.min(sheet.outputWidth, sheet.outputHeight) > (short + 0.5) * mm ||
        Math.max(sheet.outputWidth, sheet.outputHeight) > (long + 0.5) * mm,
    );
  if (exceeds(297, 420))
    warnings.push(
      "Output exceeds A3. Choose A4/A3 paper or confirm your printer supports the sheet size.",
    );
  else if (exceeds(210, 297))
    warnings.push(
      "Output exceeds A4. Choose A4 paper or use a printer that supports this sheet size.",
    );
  if (
    sheets.some((sheet) =>
      (sheet.bleedBoxes ?? sheet.boxes).some(
        (box) =>
          Math.min(
            box.x,
            box.y,
            sheet.outputWidth - box.x - box.width,
            sheet.outputHeight - box.y - box.height,
          ) <
          5 * mm - 0.01,
      ),
    )
  )
    warnings.push(
      "Artwork is within 5 mm of a paper edge. Check your printer’s printable area; increase margins if needed. The 5 mm allowance is a guide, not a printer measurement.",
    );
  const format = getSourceFormat(filename);
  if (format === "jpeg" || format === "png") {
    let maximumScale = 0;
    for (const sheet of sheets)
      for (const scale of sheet.scales)
        maximumScale = Math.max(maximumScale, scale);
    const ppi = 96 / maximumScale;
    if (Number.isFinite(ppi) && ppi < 150)
      warnings.push(
        `Image resolution is approximately ${Math.round(ppi)} ppi at the largest copy size. Reduce copy dimensions or use a higher-resolution image; 150 ppi is a general warning threshold.`,
      );
  }
  return warnings;
}

export function printWarningSeverity(
  sheets: OutputSheet[],
  filename: string,
): "warning" | "danger" {
  const mm = 72 / 25.4;
  const format = getSourceFormat(filename);
  const image = format === "jpeg" || format === "png";
  return sheets.some(
    (sheet) =>
      Math.min(sheet.outputWidth, sheet.outputHeight) > 297.5 * mm ||
      Math.max(sheet.outputWidth, sheet.outputHeight) > 420.5 * mm ||
      (image && sheet.scales.some((scale) => 96 / scale < 72)),
  )
    ? "danger"
    : "warning";
}
