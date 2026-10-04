import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";
import { withDeadline } from "./async.ts";
import {
  loadPdfjs,
  type PdfjsLibrary,
  previewDocumentOptions,
} from "./dependencies.ts";
import { readBlob } from "./read-blob.ts";

export const THUMBNAILS_PER_SCREEN = 8;

// One controller owns the source preview only while its modal is open.
export function createThumbnailController(
  file: Blob,
  {
    loadLibrary = loadPdfjs,
    timeoutMs = 20_000,
  }: { loadLibrary?: () => Promise<PdfjsLibrary>; timeoutMs?: number } = {},
) {
  let cached: {
    task: PDFDocumentLoadingTask;
    document: PDFDocumentProxy;
  } | null = null;
  let stopRender: (() => void) | undefined;
  let disposed = false;
  let token = 0;
  const release = () => {
    if (cached) void cached.task.destroy().catch(() => {});
    cached = null;
  };
  const cancelRender = () => {
    stopRender?.();
    stopRender = undefined;
  };
  const dispose = () => {
    disposed = true;
    cancelRender();
    release();
  };
  const render = async (
    targets: { page: number; canvas: HTMLCanvasElement }[],
  ) => {
    if (disposed) return;
    if (targets.length > THUMBNAILS_PER_SCREEN)
      throw new Error("Too many thumbnails requested.");
    cancelRender();
    const controller = new AbortController();
    const renderToken = ++token;
    let loading: PDFDocumentLoadingTask | null = null;
    let drawing: RenderTask | null = null;
    const current = () =>
      !disposed && !controller.signal.aborted && token === renderToken;
    const stop = () => {
      controller.abort();
      drawing?.cancel();
      if (loading) void loading.destroy().catch(() => {});
      loading = null;
      drawing = null;
    };
    stopRender = stop;
    const work = async () => {
      let pdf = cached?.document;
      if (!pdf) {
        const library = await loadLibrary();
        if (!current()) return;
        const bytes = await readBlob(file, controller.signal);
        if (!current()) return;
        loading = library.getDocument({
          data: bytes,
          ...previewDocumentOptions,
        });
        pdf = await loading.promise;
        if (!current()) return;
        cached = { task: loading, document: pdf };
        loading = null;
      }
      for (const target of targets) {
        if (!current()) return;
        const page = await pdf.getPage(target.page);
        if (!current()) return;
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: Math.min(192 / base.width, 256 / base.height),
        });
        // Detached canvases keep cancelled pagination from painting newer pages.
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas rendering is unavailable.");
        drawing = page.render({ canvas, canvasContext: context, viewport });
        await drawing.promise;
        if (!current()) return;
        drawing = null;
        target.canvas.width = canvas.width;
        target.canvas.height = canvas.height;
        const targetContext = target.canvas.getContext("2d", { alpha: false });
        if (!targetContext) throw new Error("Canvas rendering is unavailable.");
        targetContext.drawImage(canvas, 0, 0);
        page.cleanup();
      }
    };
    try {
      await withDeadline(
        work(),
        controller.signal,
        timeoutMs,
        "Thumbnail preview timed out. Choose a page by number or retry.",
      );
    } catch (error) {
      if (current()) {
        release();
        throw error;
      }
    } finally {
      stop();
      if (token === renderToken) stopRender = undefined;
    }
  };
  return { file, render, cancelRender, dispose };
}
