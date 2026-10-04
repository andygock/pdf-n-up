import { zipSync } from "fflate";
import type { ConversionResult } from "./types.ts";

export function createArchive(outputs: ConversionResult[]) {
  if (
    !outputs.length ||
    outputs.length > 20 ||
    outputs.reduce((sum, item) => sum + item.bytes.byteLength, 0) > 100_000_000
  )
    throw new Error(
      "Choose between 1 and 20 results totalling no more than 100 MB.",
    );
  const files: Record<string, Uint8Array> = {};
  for (const [index, output] of outputs.entries()) {
    const name =
      output.filename.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 160) ||
      "document.pdf";
    // Prefixes avoid collisions and prevent user filenames becoming ZIP paths.
    files[`${String(index + 1).padStart(3, "0")}_${name}`] = output.bytes;
  }
  return zipSync(files, { level: 0 });
}
