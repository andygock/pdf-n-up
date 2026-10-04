// Ship the module, worker and auxiliary assets from one locked release.
// Lazy loading keeps generation independent of preview availability.
import type { DocumentInitParameters } from "pdfjs-dist/types/src/display/api";
import { withDeadline } from "./async";

export type PdfjsLibrary = typeof import("pdfjs-dist");
let modulePromise: Promise<PdfjsLibrary> | null = null;
let attempt = 0;

const assetUrl = (path: string): string => {
  const base = new URL(
    import.meta.env?.BASE_URL ?? "./",
    typeof document === "undefined"
      ? import.meta.url
      : (document.baseURI ?? import.meta.url),
  );
  return new URL(`vendor/pdfjs-dist/${path}`, base).href;
};

export const loadPdfjs = (): Promise<PdfjsLibrary> => {
  if (!modulePromise) {
    const url = new URL(assetUrl("pdf.mjs"));
    // A new URL permits retry after a failed fetch cached by the browser.
    url.searchParams.set("attempt", String(++attempt));
    modulePromise = withDeadline<PdfjsLibrary>(
      import(/* @vite-ignore */ url.href),
      null,
      8_000,
      "The preview library could not be loaded in time.",
    )
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = assetUrl("pdf.worker.mjs");
        return pdfjs;
      })
      .catch((error: unknown) => {
        modulePromise = null;
        throw error;
      });
  }
  return modulePromise;
};

export const previewDocumentOptions = {
  cMapUrl: assetUrl("cmaps/"),
  standardFontDataUrl: assetUrl("standard_fonts/"),
  wasmUrl: assetUrl("wasm/"),
  iccUrl: assetUrl("iccs/"),
  cMapPacked: true,
  stopAtErrors: true,
  // The UI warns that very large images may be omitted from this bounded preview.
  maxImageSize: 16_000_000,
  canvasMaxAreaInBytes: 64 * 1024 * 1024,
} satisfies DocumentInitParameters;
