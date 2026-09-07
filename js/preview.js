import { elements, state } from "./core.js";
import { loadPdfjs, previewDocumentOptions } from "./dependencies.js";
import { withDeadline } from "./async.js";

let resizeTimer;
let lastSize = "";

const visibleSize = () => {
  if (state.activeView !== "convert") return null;
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

// Injectable loader/deadline keep failure recovery testable without a browser
// or network. Production callers use the local PDF.js loader and 20 seconds.
export const renderOutputPreview = async ({
  loadLibrary = loadPdfjs,
  timeoutMs = 20_000,
} = {}) => {
  const output = state.output;
  if (!output) return;
  output.cancelPreview?.();
  const size = visibleSize();
  if (!size) return;

  const controller = new AbortController();
  const token = ++state.previewRenderToken;
  let loadingTask;
  let renderTask;
  const current = () =>
    !controller.signal.aborted &&
    state.output === output &&
    token === state.previewRenderToken;
  const stopTasks = () => {
    renderTask?.cancel();
    if (loadingTask) void loadingTask.destroy().catch(() => {});
    renderTask = null;
    loadingTask = null;
  };
  output.cancelPreview = () => {
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
    const data = new Uint8Array(await output.blob.arrayBuffer());
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
    renderTask = page.render({ canvasContext: context, viewport });
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
      elements.previewError.textContent = `${error.message} The PDF is still available to open or download.`;
      elements.previewError.classList.remove("hidden");
      elements.retryPreviewButton.classList.remove("hidden");
    }
  } finally {
    if (current()) elements.previewLoading.classList.add("hidden");
    controller.abort();
    stopTasks();
  }
};

export const schedulePreview = () => {
  const size = visibleSize();
  const key = size
    ? `${Math.round(size.width)}:${Math.round(size.height)}:${window.devicePixelRatio}`
    : "hidden";
  if (key === lastSize) return;
  clearTimeout(resizeTimer);
  lastSize = key;
  state.output?.cancelPreview?.();
  if (size) resizeTimer = setTimeout(() => void renderOutputPreview(), 150);
};

export const initialisePreview = () => {
  new ResizeObserver(schedulePreview).observe(elements.previewViewport);
  window.addEventListener("resize", schedulePreview);
  document.addEventListener("viewchange", schedulePreview);
  elements.retryPreviewButton.addEventListener(
    "click",
    () => void renderOutputPreview(),
  );
};
