// Ship the module, worker and auxiliary assets from one locked release.
// Lazy loading keeps generation independent of preview availability.
import { withDeadline } from "./async.js";
let modulePromise;
let attempt = 0;
export const loadPdfjs = () => {
  if (!modulePromise) {
    const url = new URL("../vendor/pdfjs-dist/pdf.mjs", import.meta.url);
    // A new URL permits retry after a failed fetch cached by the browser.
    url.searchParams.set("attempt", String(++attempt));
    modulePromise = withDeadline(
      import(url.href),
      null,
      8_000,
      "The preview library could not be loaded in time.",
    )
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "../vendor/pdfjs-dist/pdf.worker.mjs",
          import.meta.url,
        ).href;
        return pdfjs;
      })
      .catch((error) => {
        modulePromise = null;
        throw error;
      });
  }
  return modulePromise;
};

const assetUrl = (directory) =>
  new URL(`../vendor/pdfjs-dist/${directory}/`, import.meta.url).href;
export const previewDocumentOptions = {
  cMapUrl: assetUrl("cmaps"),
  standardFontDataUrl: assetUrl("standard_fonts"),
  wasmUrl: assetUrl("wasm"),
  iccUrl: assetUrl("iccs"),
  cMapPacked: true,
  stopAtErrors: true,
  // The UI warns that very large images may be omitted from this bounded preview.
  maxImageSize: 16_000_000,
  canvasMaxAreaInBytes: 64 * 1024 * 1024,
};
