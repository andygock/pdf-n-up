import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";
import { withDeadline } from "./async";
import {
  loadPdfjs,
  type PdfjsLibrary,
  previewDocumentOptions,
} from "./dependencies";

import type { PdfOutput } from "./types.ts";

export interface PreviewElements {
  previewViewport: HTMLDivElement;
  previewLoading: HTMLDivElement;
  pdfPreview: HTMLCanvasElement;
  previewError: HTMLParagraphElement;
  retryPreviewButton: HTMLButtonElement;
}

// Injectable loader/deadline keep failure recovery testable without a browser
// or network. Production callers use the local PDF.js loader and 20 seconds.
export const createPreviewController = (
  elements: PreviewElements,
  {
    loadLibrary = loadPdfjs,
    timeoutMs = 20_000,
  }: { loadLibrary?: () => Promise<PdfjsLibrary>; timeoutMs?: number } = {},
) => {
  let output: PdfOutput | null = null;
  let active = false;
  let token = 0;
  let cancelPreview: (() => void) | undefined;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSize = "";
  let cached: {
    task: PDFDocumentLoadingTask;
    document: PDFDocumentProxy;
  } | null = null;

  const releaseDocument = () => {
    if (cached) void cached.task.destroy().catch(() => {});
    cached = null;
  };

  const visibleSize = () => {
    if (!active) return null;
    const bounds = elements.previewViewport.getBoundingClientRect();
    const style = getComputedStyle(elements.previewViewport);
    const width =
      bounds.width -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    const height =
      bounds.height -
      parseFloat(style.paddingTop) -
      parseFloat(style.paddingBottom);
    return width >= 2 && height >= 2 ? { width, height } : null;
  };

  const cancelRender = () => {
    clearTimeout(resizeTimer);
    cancelPreview?.();
    cancelPreview = undefined;
  };

  const cancel = () => {
    cancelRender();
    releaseDocument();
  };

  const render = async () => {
    clearTimeout(resizeTimer);
    if (!output) return;
    cancelPreview?.();
    const size = visibleSize();
    if (!size) return;
    const renderedOutput = output;
    const controller = new AbortController();
    const renderToken = ++token;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let renderTask: RenderTask | null = null;
    const current = () =>
      !controller.signal.aborted &&
      output === renderedOutput &&
      renderToken === token;
    const stopTasks = () => {
      renderTask?.cancel();
      if (loadingTask) void loadingTask.destroy().catch(() => {});
      renderTask = null;
      loadingTask = null;
    };
    cancelPreview = () => {
      controller.abort();
      stopTasks();
    };
    elements.previewLoading.hidden = false;
    elements.previewLoading.textContent = "Rendering preview locally…";
    elements.previewError.hidden = true;
    elements.retryPreviewButton.hidden = true;
    elements.pdfPreview.hidden = true;

    // A detached canvas prevents cancelled work from overwriting a newer render.
    const work = async () => {
      let pdfDocument = cached?.document;
      if (!pdfDocument) {
        const pdfjs = await loadLibrary();
        if (!current()) return;
        const data = new Uint8Array(await renderedOutput.blob.arrayBuffer());
        if (!current()) return;
        loadingTask = pdfjs.getDocument({ data, ...previewDocumentOptions });
        pdfDocument = await loadingTask.promise;
        if (!current()) return;
        // A completed document belongs to this output, not to a particular
        // canvas size. Pending loads still belong to their cancellable render.
        cached = { task: loadingTask, document: pdfDocument };
        loadingTask = null;
      }
      if (!current()) return;
      const page = await pdfDocument.getPage(1);
      if (!current()) return;
      const base = page.getViewport({ scale: 1 });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const scale = Math.min(
        1.5,
        size.width / base.width,
        size.height / base.height,
        Math.sqrt(4_000_000 / (base.width * base.height)) / ratio,
      );
      const viewport = page.getViewport({ scale: scale * ratio });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas rendering is unavailable.");
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      await renderTask.promise;
      if (!current()) return;
      const target = elements.pdfPreview;
      target.width = canvas.width;
      target.height = canvas.height;
      target.style.width = `${viewport.width / ratio}px`;
      target.style.height = `${viewport.height / ratio}px`;
      const targetContext = target.getContext("2d", { alpha: false });
      if (!targetContext) throw new Error("Canvas rendering is unavailable.");
      targetContext.drawImage(canvas, 0, 0);
      target.hidden = false;
    };
    try {
      // One deadline covers module import, worker startup, parsing and drawing.
      await withDeadline(
        work(),
        controller.signal,
        timeoutMs,
        "Preview exceeded 20 seconds and was stopped.",
      );
    } catch (error) {
      if (current()) {
        releaseDocument();
        const message = error instanceof Error ? error.message : String(error);
        elements.previewError.textContent = `${message} The PDF is still available to open or download.`;
        elements.previewError.hidden = false;
        elements.retryPreviewButton.hidden = false;
      }
    } finally {
      if (current()) elements.previewLoading.hidden = true;
      controller.abort();
      stopTasks();
    }
  };

  const schedule = () => {
    const size = visibleSize();
    const key = size
      ? `${Math.round(size.width)}:${Math.round(size.height)}:${window.devicePixelRatio}`
      : "hidden";
    if (key === lastSize) return;
    cancelRender();
    lastSize = key;
    if (size) resizeTimer = setTimeout(() => void render(), 150);
  };

  const update = (nextOutput: PdfOutput | null, nextActive: boolean) => {
    const changed = output !== nextOutput;
    if (changed) {
      cancel();
      elements.pdfPreview.width = 0;
      elements.pdfPreview.height = 0;
      elements.pdfPreview.hidden = true;
      elements.previewError.hidden = true;
      elements.retryPreviewButton.hidden = true;
    }
    output = nextOutput;
    active = nextActive;
    if (!output) {
      elements.pdfPreview.hidden = true;
      elements.previewError.hidden = true;
      elements.retryPreviewButton.hidden = true;
      elements.previewLoading.hidden = false;
      elements.previewLoading.textContent =
        "Select a PDF to see the output preview.";
    } else if (changed) {
      const size = visibleSize();
      lastSize = size
        ? `${Math.round(size.width)}:${Math.round(size.height)}:${window.devicePixelRatio}`
        : "hidden";
      void render();
    }
    schedule();
  };

  return { update, render, schedule, cancel };
};
