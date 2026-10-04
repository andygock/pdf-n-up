// PDF dimensions are measured in points (72 points per inch), while the
// interface presents sizes in mm.

const LEGACY_STORAGE_KEY = "pdf-n-up-state-v1";
export const MAX_FILE_SIZE = 50_000_000;
const POINTS_PER_MM = 72 / 25.4;
const STANDARD_PAPER_SIZES: [string, number, number][] = [
  ["A0", 841, 1189],
  ["A1", 594, 841],
  ["A2", 420, 594],
  ["A3", 297, 420],
  ["A4", 210, 297],
  ["A5", 148, 210],
  ["A6", 105, 148],
  ["A7", 74, 105],
  ["A8", 52, 74],
  ["A9", 37, 52],
  ["A10", 26, 37],
  ["Letter", 215.9, 279.4],
  ["Legal", 215.9, 355.6],
  ["Tabloid", 279.4, 431.8],
  ["Executive", 184.2, 266.7],
];

// Copy used by the shared page header for each client-side application view.
export const pageTitles = {
  convert: {
    title: "Create an N-up PDF",
    description: "Arrange repeated copies of one PDF page on a single sheet.",
  },
  guide: {
    title: "How it works",
    description:
      "Technical details for page scaling, placement and output generation.",
  },
  privacy: {
    title: "Privacy",
    description: "How local processing and browser memory are handled.",
  },
};

// Remove metadata written by versions that kept a recent-conversion history.
// No new application state is written to persistent browser storage.
export const removeLegacyPersistedState = () => {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // The application remains functional when browser storage is blocked.
  }
};

// Format byte counts with decimal (base-1000) units for display. Precision is
// reduced as values grow so labels remain compact and easy to scan.
export const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "Unknown";
  }

  const units = ["B", "kB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }

  const decimals = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
};

export const pointsToMillimetres = (points: number) => points / POINTS_PER_MM;

export const findPaperName = (widthMm: number, heightMm: number) => {
  const toleranceMm = 1;
  return STANDARD_PAPER_SIZES.find(
    ([, standardWidth, standardHeight]) =>
      (Math.abs(widthMm - standardWidth) <= toleranceMm &&
        Math.abs(heightMm - standardHeight) <= toleranceMm) ||
      (Math.abs(widthMm - standardHeight) <= toleranceMm &&
        Math.abs(heightMm - standardWidth) <= toleranceMm),
  )?.[0];
};

// pdf-lib reports page dimensions in points; convert both axes for the UI.
export const formatPageSize = (width: number, height: number) => {
  const widthMm = pointsToMillimetres(width);
  const heightMm = pointsToMillimetres(height);
  const paperName = findPaperName(widthMm, heightMm);
  return `${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm${paperName ? ` (${paperName})` : ""}`;
};

// Extension checks improve error messages, but the PDF magic bytes provide a
// quick content check before the entire (potentially large) file is loaded.
export const detectPdfSignature = async (file: File) => {
  const signatureBuffer = await file.slice(0, 5).arrayBuffer();
  const signature = new TextDecoder("ascii").decode(signatureBuffer);
  return signature === "%PDF-";
};
