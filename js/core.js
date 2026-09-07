// PDF dimensions are measured in points (72 points per inch), while the
// interface presents sizes in mm.
import { LAYOUTS } from "./geometry.js";

const LEGACY_STORAGE_KEY = "pdf-n-up-state-v1";
export const MAX_FILE_SIZE = 50_000_000;
const POINTS_PER_MM = 72 / 25.4;
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
  marginMm: 0,
  gutterMm: 0,
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
  const selectedLayout = document.querySelector('input[name="layout"]:checked');
  const selectedPaperMode = document.querySelector(
    'input[name="paperMode"]:checked',
  );

  state.layout = LAYOUTS[selectedLayout?.value] || LAYOUTS[4];
  state.paperMode = selectedPaperMode?.value === "same" ? "same" : "expand";
  state.marginMm = Number(document.querySelector("#marginMm").value);
  state.gutterMm = Number(document.querySelector("#gutterMm").value);
};

// Cache frequently used DOM nodes once. The HTML contract requires each of
// these IDs to exist before this script runs.
export const elements = {
  sidebar: document.querySelector("#sidebar"),
  appArea: document.querySelector(".app-area"),
  sidebarBackdrop: document.querySelector("#sidebarBackdrop"),
  mobileMenuButton: document.querySelector("#mobileMenuButton"),
  pageTitle: document.querySelector("#pageTitle"),
  pageDescription: document.querySelector("#pageDescription"),

  fileInput: document.querySelector("#fileInput"),
  selectFileButton: document.querySelector("#selectFileButton"),
  replaceFileButton: document.querySelector("#replaceFileButton"),
  clearDocumentButton: document.querySelector("#clearDocumentButton"),
  cancelButton: document.querySelector("#cancelButton"),
  retryPreviewButton: document.querySelector("#retryPreviewButton"),
  useSourceSizeButton: document.querySelector("#useSourceSizeButton"),
  sourceWarning: document.querySelector("#sourceWarning"),
  dropZone: document.querySelector("#dropZone"),
  sourceDetails: document.querySelector("#sourceDetails"),
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

// Extension checks improve error messages, but the PDF magic bytes provide a
// quick content check before the entire (potentially large) file is loaded.
export const detectPdfSignature = async (file) => {
  const signatureBuffer = await file.slice(0, 5).arrayBuffer();
  const signature = new TextDecoder("ascii").decode(signatureBuffer);
  return signature === "%PDF-";
};
