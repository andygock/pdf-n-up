import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
import { withDeadline } from "./async";
import {
  loadPdfjs,
  type PdfjsLibrary,
  previewDocumentOptions,
} from "./dependencies";

export interface PreviewOutput {
  blob: Blob;
  url: string;
  filename: string;
  size: number;
}

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
  let output: PreviewOutput | null = null;
  let active = false;
  let token = 0;
  let cancelPreview: (() => void) | undefined;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSize = "";

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

  const cancel = () => {
    clearTimeout(resizeTimer);
    cancelPreview?.();
    cancelPreview = undefined;
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
    elements.previewLoading.classList.remove("hidden");
    elements.previewLoading.textContent = "Rendering preview locally…";
    elements.previewError.classList.add("hidden");
    elements.retryPreviewButton.classList.add("hidden");
    elements.pdfPreview.classList.add("hidden");

    // A detached canvas prevents cancelled work from overwriting a newer render.
    const work = async () => {
      const pdfjs = await loadLibrary();
      if (!current()) return;
      const data = new Uint8Array(await renderedOutput.blob.arrayBuffer());
      if (!current()) return;
      loadingTask = pdfjs.getDocument({ data, ...previewDocumentOptions });
      const pdfDocument = await loadingTask.promise;
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
      target.classList.remove("hidden");
      page.cleanup();
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
        const message = error instanceof Error ? error.message : String(error);
        elements.previewError.textContent = `${message} The PDF is still available to open or download.`;
        elements.previewError.classList.remove("hidden");
        elements.retryPreviewButton.classList.remove("hidden");
      }
    } finally {
      if (current()) elements.previewLoading.classList.add("hidden");
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
    cancel();
    lastSize = key;
    if (size) resizeTimer = setTimeout(() => void render(), 150);
  };

  const update = (nextOutput: PreviewOutput | null, nextActive: boolean) => {
    const changed = output !== nextOutput;
    if (changed) {
      cancel();
      elements.pdfPreview.width = 0;
      elements.pdfPreview.height = 0;
      elements.pdfPreview.classList.add("hidden");
      elements.previewError.classList.add("hidden");
      elements.retryPreviewButton.classList.add("hidden");
    }
    output = nextOutput;
    active = nextActive;
    if (!output) {
      elements.pdfPreview.classList.add("hidden");
      elements.previewError.classList.add("hidden");
      elements.retryPreviewButton.classList.add("hidden");
      elements.previewLoading.classList.remove("hidden");
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
