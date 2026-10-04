import { LAYOUTS } from "./geometry.ts";
import type { ConversionOptions } from "./types.ts";

export const PREFERENCES_KEY = "pdf-nup.preferences.v1";
export const DEFAULT_OPTIONS: ConversionOptions = {
  layout: LAYOUTS[4],
  paperMode: "expand",
  marginMm: 0,
  gutterMm: 0,
  cropMarks: false,
  paperWidthMm: 210,
  paperHeightMm: 297,
  scaleMode: "fit",
  scalePercent: 100,
  copyWidthMm: 90,
  copyHeightMm: 50,
};

// Explicitly allowlist settings so document metadata can never enter storage.
export function parsePreferences(value: unknown): ConversionOptions | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const layout = data.layout as Record<string, unknown> | undefined;
  if (
    !layout ||
    ![layout.columns, layout.rows].every(
      (n) => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 20,
    )
  )
    return null;
  const columns = layout.columns as number,
    rows = layout.rows as number;
  if (columns * rows > 100 || layout.copies !== columns * rows) return null;
  if (
    typeof data.paperMode !== "string" ||
    !["expand", "same", "a4", "a3", "custom"].includes(data.paperMode)
  )
    return null;
  if (
    data.scaleMode !== undefined &&
    (typeof data.scaleMode !== "string" ||
      !["fit", "percent", "dimensions"].includes(data.scaleMode))
  )
    return null;
  if (layout.custom !== undefined && typeof layout.custom !== "boolean")
    return null;
  if (data.cropMarks !== undefined && typeof data.cropMarks !== "boolean")
    return null;
  const result: ConversionOptions = {
    layout: {
      columns,
      rows,
      copies: columns * rows,
      custom: layout.custom === true,
    },
    paperMode: data.paperMode as ConversionOptions["paperMode"],
  };
  const ranges = {
    marginMm: [0, 100],
    gutterMm: [0, 100],
    paperWidthMm: [0.01, 5080],
    paperHeightMm: [0.01, 5080],
    copyWidthMm: [0.01, 5080],
    copyHeightMm: [0.01, 5080],
    scalePercent: [0.01, 10000],
  } as const;
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
    const value = data[key];
    if (value === undefined) continue;
    const [min, max] = ranges[key];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < min ||
      value > max
    )
      return null;
    result[key] = value;
  }
  result.cropMarks = data.cropMarks === true;
  result.scaleMode = data.scaleMode as ConversionOptions["scaleMode"];
  return result;
}

export function readPreferences(): ConversionOptions | null {
  try {
    return parsePreferences(
      JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "null"),
    );
  } catch {
    return null;
  }
}

export function savePreferences(options: ConversionOptions | null) {
  if (!options) {
    localStorage.removeItem(PREFERENCES_KEY);
    return;
  }
  const safe = parsePreferences(options);
  if (!safe)
    throw new Error("Correct invalid settings before saving preferences.");
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(safe));
}
