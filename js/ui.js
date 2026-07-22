import {
  elements,
  escapeHtml,
  formatBytes,
  formatPageSize,
  getOutputGeometry,
  getResolvedLayout,
  makeOutputFilename,
  state,
} from "./core.js";

// Central status renderer keeps colour, icon, message, spinner, and progress
// behaviour consistent across validation, conversion, and download actions.
export const setStatus = ({
  type = "neutral",
  symbol = "i",
  title,
  message,
  loading = false,
  progress = null,
}) => {
  elements.statusBox.className = "status-box";
  elements.statusBox.classList.add(type);

  elements.statusSymbol.innerHTML = loading
    ? '<span class="spinner" aria-hidden="true"></span>'
    : escapeHtml(symbol);

  elements.statusTitle.textContent = title;
  elements.statusMessage.textContent = message;

  // A loading state without a numeric value uses an indeterminate animation;
  // numeric progress is clamped so malformed values cannot overflow the bar.
  if (loading || Number.isFinite(progress)) {
    elements.progressTrack.classList.remove("hidden");

    if (loading && !Number.isFinite(progress)) {
      elements.progressBar.className = "progress-bar indeterminate";
      elements.progressBar.style.width = "";
    } else {
      elements.progressBar.className = "progress-bar";
      elements.progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }
  } else {
    elements.progressTrack.classList.add("hidden");
    elements.progressBar.className = "progress-bar";
    elements.progressBar.style.width = "0";
  }
};

// Object URLs retain their backing Blob until explicitly revoked. Release the
// previous output whenever it is replaced, cleared, or the page is unloaded.
export const revokeOutputUrl = () => {
  if (state.output?.url) {
    URL.revokeObjectURL(state.output.url);
  }
};

// Invalidate generated data, cancel preview work, and release its temporary
// object URL. No generated PDF is retained in persistent browser storage.
export const resetOutput = () => {
  state.previewRenderToken += 1;
  state.output?.renderTask?.cancel();
  state.output?.loadingTask?.destroy();
  revokeOutputUrl();
  state.output = null;

  elements.outputPanel.classList.add("hidden");
  elements.pdfPreview.classList.add("hidden");
  elements.previewLoading.classList.remove("hidden");
  elements.previewError.classList.add("hidden");
  elements.previewError.textContent = "";
  elements.pdfPreview.width = 0;
  elements.pdfPreview.height = 0;
  elements.openOutputButton.disabled = true;
  elements.downloadOutputButton.disabled = true;
};

// Return all source-dependent controls and labels to their initial state.
// Callers may override the status copy to explain why the reset occurred.
export const clearSource = ({
  statusTitle = "Ready",
  statusMessage = "Select a single-page PDF to begin.",
} = {}) => {
  resetOutput();

  state.source = null;
  state.processing = false;
  elements.fileInput.value = "";

  elements.dropZone.classList.remove("has-file");
  elements.dropTitle.textContent = "Drop a PDF here";
  elements.dropDescription.textContent =
    "Or select a file. Valid PDFs convert into an in-browser preview.";

  elements.detailsEmpty.classList.remove("hidden");
  elements.detailsList.classList.add("hidden");

  setStatus({
    type: "neutral",
    symbol: "i",
    title: statusTitle,
    message: statusMessage,
  });
};

// Render metadata calculated during validation. Keeping this separate from
// loading makes it easy to refresh the detail panel from the current state.
export const updateDocumentDetails = () => {
  if (!state.source) {
    elements.detailsEmpty.classList.remove("hidden");
    elements.detailsList.classList.add("hidden");
    return;
  }

  const { file, width, height } = state.source;
  const { outputWidth, outputHeight, scale } = getOutputGeometry(
    width,
    height,
  );
  state.source.outputWidth = outputWidth;
  state.source.outputHeight = outputHeight;
  state.source.outputName = makeOutputFilename(file.name);

  elements.detailsEmpty.classList.add("hidden");
  elements.detailsList.classList.remove("hidden");

  elements.detailFilename.textContent = file.name;
  elements.detailFileSize.textContent = formatBytes(file.size);
  elements.detailSourceSize.textContent = formatPageSize(width, height);
  elements.detailOutputSize.textContent = formatPageSize(
    outputWidth,
    outputHeight,
  );
  elements.detailScale.textContent = `${Number((scale * 100).toFixed(4))}%`;
  const resolvedLayout = getResolvedLayout(width, height);
  elements.detailLayout.textContent = `${resolvedLayout.copies}-up (${resolvedLayout.columns}×${resolvedLayout.rows})`;
};

// Lock file selection while conversion is running.
export const setProcessingState = (processing) => {
  state.processing = processing;

  elements.selectFileButton.disabled = processing;
  elements.fileInput.disabled = processing;
  document
    .querySelectorAll('input[name="layout"], input[name="paperMode"]')
    .forEach((input) => {
      input.disabled = processing;
    });
};

// Programmatically opening the hidden input gives the drop zone and explicit
// select button one shared file-selection path.
export const openFilePicker = () => {
  if (!state.processing) {
    elements.fileInput.click();
  }
};
