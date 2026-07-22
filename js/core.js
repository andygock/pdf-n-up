// PDF dimensions are measured in points (72 points per inch), while the
// interface presents sizes in mm.
const LEGACY_STORAGE_KEY = "pdf-n-up-state-v1";
export const MAX_FILE_SIZE = 200 * 1024 * 1024;
const POINTS_PER_MM = 72 / 25.4;
export const LAYOUTS = {
  2: { copies: 2, columns: 2, rows: 1 },
  4: { copies: 4, columns: 2, rows: 2 },
  8: { copies: 8, columns: 4, rows: 2 },
  9: { copies: 9, columns: 3, rows: 3 },
  16: { copies: 16, columns: 4, rows: 4 },
};
const STANDARD_PAPER_SIZES = [
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

export const defaultState = {
  activeView: "convert",
  source: null,
  output: null,
  processing: false,
  layout: LAYOUTS[4],
  paperMode: "expand",
};

export const state = {
  ...defaultState,
  previewRenderToken: 0,
};

// Browsers may restore radio selections from the previous page session even
// though the JavaScript state starts from its defaults. Read the checked
// controls before the first conversion so the visible and applied options
// always agree.
export const syncOptionsFromDom = () => {
  const selectedLayout = document.querySelector(
    'input[name="layout"]:checked',
  );
  const selectedPaperMode = document.querySelector(
    'input[name="paperMode"]:checked',
  );

  state.layout = LAYOUTS[selectedLayout?.value] || LAYOUTS[4];
  state.paperMode = selectedPaperMode?.value === "same" ? "same" : "expand";
};

// Cache frequently used DOM nodes once. The HTML contract requires each of
// these IDs to exist before this script runs.
export const elements = {
  sidebar: document.querySelector("#sidebar"),
  sidebarBackdrop: document.querySelector("#sidebarBackdrop"),
  mobileMenuButton: document.querySelector("#mobileMenuButton"),
  pageTitle: document.querySelector("#pageTitle"),
  pageDescription: document.querySelector("#pageDescription"),

  fileInput: document.querySelector("#fileInput"),
  selectFileButton: document.querySelector("#selectFileButton"),
  dropZone: document.querySelector("#dropZone"),
  dropTitle: document.querySelector("#dropTitle"),
  dropDescription: document.querySelector("#dropDescription"),

  statusBox: document.querySelector("#statusBox"),
  statusSymbol: document.querySelector("#statusSymbol"),
  statusTitle: document.querySelector("#statusTitle"),
  statusMessage: document.querySelector("#statusMessage"),
  progressTrack: document.querySelector("#progressTrack"),
  progressBar: document.querySelector("#progressBar"),

  detailsEmpty: document.querySelector("#detailsEmpty"),
  detailsList: document.querySelector("#detailsList"),
  detailFilename: document.querySelector("#detailFilename"),
  detailFileSize: document.querySelector("#detailFileSize"),
  detailSourceSize: document.querySelector("#detailSourceSize"),
  detailOutputSize: document.querySelector("#detailOutputSize"),
  detailScale: document.querySelector("#detailScale"),
  detailLayout: document.querySelector("#detailLayout"),

  outputPanel: document.querySelector("#outputPanel"),
  outputSummary: document.querySelector("#outputSummary"),
  previewViewport: document.querySelector("#previewViewport"),
  previewLoading: document.querySelector("#previewLoading"),
  pdfPreview: document.querySelector("#pdfPreview"),
  previewError: document.querySelector("#previewError"),
  openOutputButton: document.querySelector("#openOutputButton"),
  downloadOutputButton: document.querySelector("#downloadOutputButton"),
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
export const formatBytes = (bytes) => {
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

export const pointsToMillimetres = (points) => points / POINTS_PER_MM;

export const findPaperName = (widthMm, heightMm) => {
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
export const formatPageSize = (width, height) => {
  const widthMm = pointsToMillimetres(width);
  const heightMm = pointsToMillimetres(height);
  const paperName = findPaperName(widthMm, heightMm);
  return `${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm${paperName ? ` (${paperName})` : ""}`;
};

// Layout labels describe portrait input. Transpose rectangular grids for a
// landscape source so sheets grow along the source's shorter axis and no
// empty rows or columns are introduced.
export const getResolvedLayout = (width, height) => {
  const { copies, columns, rows } = state.layout;
  return width > height
    ? { copies, columns: rows, rows: columns }
    : { copies, columns, rows };
};

export const getOutputGeometry = (width, height) => {
  const { columns, rows } = getResolvedLayout(width, height);

  if (state.paperMode === "expand") {
    return {
      outputWidth: width * columns,
      outputHeight: height * rows,
      scale: 1,
    };
  }

  // Rectangular N-up grids often fit the source paper more efficiently when
  // the output sheet is rotated. Compare both orientations and use the one
  // whose cells allow the largest proportional copy, avoiding the unnecessary
  // whitespace previously seen with 2-up and 8-up layouts.
  const orientations = [
    { outputWidth: width, outputHeight: height },
    { outputWidth: height, outputHeight: width },
  ];
  const candidates = orientations.map((orientation) => ({
    ...orientation,
    scale: Math.min(
      orientation.outputWidth / columns / width,
      orientation.outputHeight / rows / height,
    ),
  }));

  return candidates.reduce((best, candidate) =>
    candidate.scale > best.scale ? candidate : best,
  );
};

// History rows are assembled as HTML strings. Passing user-controlled names
// through a temporary element converts markup characters into safe entities.
export const escapeHtml = (value) => {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
};

// Preserve the user's basename, replace a final .pdf suffix when present,
// and supply a useful name even if the browser reports a blank filename.
export const makeOutputFilename = (inputName, copies = state.layout.copies) => {
  const cleanedName = inputName.trim() || "document.pdf";
  const lastDot = cleanedName.lastIndexOf(".");
  const hasPdfExtension =
    lastDot > 0 && cleanedName.slice(lastDot).toLocaleLowerCase() === ".pdf";

  const basename = hasPdfExtension
    ? cleanedName.slice(0, lastDot)
    : cleanedName;

  return `${basename}_${copies}up.pdf`;
};

// Extension checks improve error messages, but the PDF magic bytes provide a
// quick content check before the entire (potentially large) file is loaded.
export const detectPdfSignature = async (file) => {
  const signatureBuffer = await file.slice(0, 5).arrayBuffer();
  const signature = new TextDecoder("ascii").decode(signatureBuffer);
  return signature === "%PDF-";
};
