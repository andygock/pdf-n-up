import {
  detectPdfSignature,
  elements,
  formatBytes,
  MAX_FILE_SIZE,
  state,
  syncOptionsFromDom,
} from "./core.js";
import { assertCompatibleOutputSize, getOutputGeometry } from "./geometry.js";
import {
  clearSource,
  resetOutput,
  setProcessingState,
  setStatus,
  updateDocumentDetails,
} from "./ui.js";
import { ConversionWorkerClient } from "./worker-client.js";
import { withDeadline } from "./async.js";
import { renderOutputPreview } from "./preview.js";

const worker = new ConversionWorkerClient();
let operation = 0;
let readingController;
const currentOptions = () => ({
  layout: state.layout,
  paperMode: state.paperMode,
  marginMm: state.marginMm,
  gutterMm: state.gutterMm,
});

// Cancellation also discards the worker's parsed source. Operation IDs prevent
// late file reads or rejected requests from changing the next document's UI.
export const clearDocument = () => {
  operation += 1;
  readingController?.abort();
  worker.dispose();
  clearSource();
  setProcessingState(false);
};

const validateAndLoadFile = async (file, token) => {
  if (!(file instanceof File))
    throw new Error("No readable file was selected.");
  if (!file.size) throw new Error("The selected file is empty.");
  if (file.size > MAX_FILE_SIZE)
    throw new Error(
      `The selected file exceeds the ${formatBytes(MAX_FILE_SIZE)} limit.`,
    );
  if (!file.name.toLowerCase().endsWith(".pdf"))
    throw new Error("The selected file does not have a .pdf extension.");
  readingController = new AbortController();
  const read = async () => {
    if (!(await detectPdfSignature(file)))
      throw new Error("The selected file does not contain a valid PDF header.");
    return new Uint8Array(await file.arrayBuffer());
  };
  const bytes = await withDeadline(
    read(),
    readingController.signal,
    15_000,
    "Reading the file timed out. Try selecting it again.",
  );
  if (token !== operation)
    throw new DOMException("Operation cancelled", "AbortError");
  return worker.request(
    "load",
    { bytes, metadata: { name: file.name, size: file.size } },
    [bytes.buffer],
  );
};

const generate = async (token) => {
  resetOutput();
  const options = currentOptions();
  // Keep the parsed source for ordinary option errors, including page limits.
  assertCompatibleOutputSize(
    getOutputGeometry({ ...state.source, ...options }),
  );
  setStatus({
    title: "Creating output",
    message: "Arranging the page copies locally. Cancel to stop processing.",
    loading: true,
  });
  const result = await worker.request("generate", options);
  if (token !== operation) return;
  const blob = new Blob([result.bytes], { type: "application/pdf" });
  state.output = {
    blob,
    url: URL.createObjectURL(blob),
    filename: result.filename,
    size: blob.size,
  };
  elements.outputSummary.textContent = `${result.filename} · ${formatBytes(blob.size)} · held in memory`;
  elements.openOutputButton.disabled = false;
  elements.downloadOutputButton.disabled = false;
  setStatus({
    type: "success",
    symbol: "✓",
    title: "Output ready",
    message: `${result.filename} is ready to open or download (${formatBytes(blob.size)}).`,
    progress: 100,
  });
  // Preview has independent status, cancellation and deadlines. Never await it
  // while holding the conversion controls disabled.
  void renderOutputPreview();
};

const showFailure = (error, title) => {
  if (error.workerLost) {
    worker.dispose();
    clearSource();
  }
  setStatus({
    type: "error",
    symbol: "!",
    title,
    message: error.message || "The PDF could not be processed.",
  });
  elements.useSourceSizeButton.classList.toggle(
    "hidden",
    !state.source || state.paperMode === "same",
  );
};

export const handleSelectedFiles = async (files) => {
  if (state.processing) return;
  const selected = Array.from(files || []);
  if (!selected.length) return;
  if (selected.length !== 1) {
    setStatus({
      type: "error",
      title: "Multiple files rejected",
      message: "Select exactly one PDF file.",
    });
    return;
  }
  clearDocument();
  syncOptionsFromDom();
  const token = ++operation;
  setProcessingState(true);
  setStatus({
    title: "Validating PDF",
    message: "Checking the file structure and page count.",
    loading: true,
  });
  try {
    const source = await validateAndLoadFile(selected[0], token);
    if (token !== operation) return;
    state.source = source;
    elements.dropZone.classList.add("has-file");
    elements.dropTitle.textContent = source.name;
    elements.dropDescription.textContent = `${formatBytes(source.size)} · one page validated`;
    updateDocumentDetails();
    await generate(token);
  } catch (error) {
    if (token === operation)
      showFailure(error, state.source ? "Conversion failed" : "File rejected");
  } finally {
    if (token === operation) setProcessingState(false);
  }
};

export const createNUpPdf = async () => {
  if (!state.source || state.processing) return;
  const token = ++operation;
  setProcessingState(true);
  try {
    await generate(token);
  } catch (error) {
    if (token === operation) showFailure(error, "Conversion failed");
  } finally {
    if (token === operation) setProcessingState(false);
  }
};

export const downloadOutput = () => {
  if (!state.output?.url) return;
  const anchor = document.createElement("a");
  anchor.href = state.output.url;
  anchor.download = state.output.filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setStatus({
    type: "success",
    symbol: "↓",
    title: "Download started",
    message: `${state.output.filename} has been passed to the browser download manager.`,
  });
};

export const openOutput = () => {
  if (!state.output?.url) return;
  const anchor = document.createElement("a");
  anchor.href = state.output.url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
};
