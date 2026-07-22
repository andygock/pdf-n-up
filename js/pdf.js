import {
  elements,
  formatBytes,
  getOutputGeometry,
  getResolvedLayout,
  makeOutputFilename,
  MAX_FILE_SIZE,
  state,
  syncOptionsFromDom,
  detectPdfSignature,
} from "./core.js";
import {
  clearSource,
  resetOutput,
  setProcessingState,
  setStatus,
  updateDocumentDetails,
} from "./ui.js";

// Validate a candidate file from cheapest checks to most expensive checks,
// then retain its bytes and dimensions for conversion. Errors are surfaced by
// handleSelectedFiles so this function can use ordinary exceptions throughout.
export const validateAndLoadFile = async (file) => {
  resetOutput();

  if (!(file instanceof File)) {
    throw new Error("No readable file was selected.");
  }

  if (file.size === 0) {
    throw new Error("The selected file is empty.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `The selected file exceeds the ${formatBytes(MAX_FILE_SIZE)} limit.`,
    );
  }

  if (!file.name.toLocaleLowerCase().endsWith(".pdf")) {
    throw new Error("The selected file does not have a .pdf extension.");
  }

  setStatus({
    type: "neutral",
    title: "Validating PDF",
    message: "Checking the file structure and page count.",
    loading: true,
  });

  const hasPdfSignature = await detectPdfSignature(file);

  if (!hasPdfSignature) {
    throw new Error("The selected file does not contain a valid PDF header.");
  }

  if (!window.PDFLib?.PDFDocument) {
    throw new Error(
      "The PDF processing library did not load. Check the network connection and reload the page.",
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  let pdfDocument;

  // pdf-lib performs the authoritative structural validation. Translate its
  // implementation-specific failures into concise, user-facing explanations.
  try {
    pdfDocument = await window.PDFLib.PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
  } catch (error) {
    const message = String(error?.message || "");

    if (/encrypt|password/i.test(message)) {
      throw new Error(
        "Password-protected or encrypted PDFs are not supported.",
      );
    }

    throw new Error(
      "The PDF could not be parsed. It may be damaged or unsupported.",
    );
  }

  const pageCount = pdfDocument.getPageCount();

  if (pageCount !== 1) {
    throw new Error(
      `This application accepts exactly one page. The selected PDF contains ${pageCount} pages.`,
    );
  }

  const page = pdfDocument.getPage(0);
  const { width, height } = page.getSize();

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("The PDF page has invalid dimensions.");
  }

  const { outputWidth, outputHeight } = getOutputGeometry(width, height);
  const outputName = makeOutputFilename(file.name);

  state.source = {
    file,
    bytes,
    width,
    height,
    outputWidth,
    outputHeight,
    outputName,
  };

  elements.dropZone.classList.add("has-file");
  elements.dropTitle.textContent = file.name;
  elements.dropDescription.textContent = `${formatBytes(file.size)} · one page validated`;

  updateDocumentDetails();

  setStatus({
    type: "success",
    symbol: "✓",
    title: "PDF validated",
    message: `The document contains one page and is ready for ${state.layout.copies}-up conversion.`,
  });
};

// Normalise FileList objects from both the picker and drag-and-drop paths,
// enforce the single-file rule, then convert valid input into a local preview.
export const handleSelectedFiles = async (files) => {
  if (state.processing) {
    return;
  }

  // Re-read restored form state at the moment it matters as an additional
  // safeguard for browsers that restore controls after initial script setup.
  syncOptionsFromDom();

  const selectedFiles = Array.from(files || []);

  if (selectedFiles.length === 0) {
    return;
  }

  if (selectedFiles.length > 1) {
    setStatus({
      type: "error",
      symbol: "!",
      title: "Multiple files rejected",
      message: "Select exactly one PDF file.",
    });
    return;
  }

  try {
    clearSource({
      statusTitle: "Preparing file",
      statusMessage: "Reading the selected PDF.",
    });

    await validateAndLoadFile(selectedFiles[0]);
    await createNUpPdf();
  } catch (error) {
    clearSource({
      statusTitle: "File rejected",
      statusMessage:
        error instanceof Error
          ? error.message
          : "The selected PDF could not be loaded.",
    });

    elements.statusBox.className = "status-box error";
    elements.statusSymbol.textContent = "!";
  }
};

// Create a new, single-page PDF containing vector-preserving copies of
// the validated source page. The work happens entirely in browser memory.
export const createNUpPdf = async () => {
  if (!state.source || state.processing) {
    return;
  }

  setProcessingState(true);
  resetOutput();

  try {
    const { bytes } = state.source;
    const { columns, rows, copies } = getResolvedLayout(
      state.source.width,
      state.source.height,
    );
    const { outputWidth, outputHeight, scale } = getOutputGeometry(
      state.source.width,
      state.source.height,
    );
    const outputName = makeOutputFilename(state.source.file.name, copies);

    setStatus({
      type: "neutral",
      title: "Creating output",
      message: "Loading and embedding the source page.",
      progress: 15,
    });

    // Yield before expensive stages so the browser can paint the latest
    // progress message rather than appearing frozen during synchronous work.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const sourceDocument = await window.PDFLib.PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });

    if (sourceDocument.getPageCount() !== 1) {
      throw new Error(
        "The source PDF changed or could not be validated as a single-page document.",
      );
    }

    const outputDocument = await window.PDFLib.PDFDocument.create();

    // Set basic document metadata on the newly created output. The source
    // document's metadata is not copied because it may no longer describe it.
    outputDocument.setTitle(outputName.replace(/\.pdf$/i, ""));
    outputDocument.setSubject(`${copies}-up PDF layout`);
    outputDocument.setCreator("PDF N-up browser application");
    outputDocument.setProducer("pdf-lib");
    outputDocument.setCreationDate(new Date());
    outputDocument.setModificationDate(new Date());

    setStatus({
      type: "neutral",
      title: "Creating output",
      message: "Embedding the source page without rasterising it.",
      progress: 40,
    });

    await new Promise((resolve) => requestAnimationFrame(resolve));

    const [embeddedPage] = await outputDocument.embedPdf(sourceDocument, [0]);
    const outputPage = outputDocument.addPage([outputWidth, outputHeight]);

    const cellWidth = outputWidth / columns;
    const cellHeight = outputHeight / rows;

    const drawnWidth = embeddedPage.width * scale;
    const drawnHeight = embeddedPage.height * scale;

    const xOffset = (cellWidth - drawnWidth) / 2;
    const yOffset = (cellHeight - drawnHeight) / 2;

    const placements = Array.from({ length: copies }, (_, index) => ({
      column: index % columns,
      row: rows - 1 - Math.floor(index / columns),
    }));

    setStatus({
      type: "neutral",
      title: "Creating output",
      message: `Placing ${copies} copies in a ${columns}-by-${rows} arrangement.`,
      progress: 65,
    });

    // PDF coordinates start at the bottom-left, so row 1 is the upper pair and
    // row 0 is the lower pair.
    for (const { column, row } of placements) {
      outputPage.drawPage(embeddedPage, {
        x: column * cellWidth + xOffset,
        y: row * cellHeight + yOffset,
        width: drawnWidth,
        height: drawnHeight,
      });
    }

    await new Promise((resolve) => requestAnimationFrame(resolve));

    setStatus({
      type: "neutral",
      title: "Finalising PDF",
      message: "Serialising the completed document.",
      progress: 85,
    });

    const outputBytes = await outputDocument.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50,
    });

    const blob = new Blob([outputBytes], {
      type: "application/pdf",
    });

    // A temporary object URL lets a normal anchor download the in-memory Blob
    // without uploading the generated PDF or writing it to browser storage.
    const url = URL.createObjectURL(blob);

    state.output = {
      blob,
      url,
      filename: outputName,
      size: blob.size,
    };

    setStatus({
      type: "neutral",
      title: "Rendering preview",
      message: "PDF.js is drawing the generated page in this browser.",
      progress: 95,
    });

    const previewRendered = await renderOutputPreview();

    setStatus({
      type: previewRendered ? "success" : "warning",
      symbol: previewRendered ? "✓" : "!",
      title: previewRendered
        ? "Output ready"
        : "Output ready without preview",
      message: previewRendered
        ? `${outputName} is ready to preview or download (${formatBytes(blob.size)}).`
        : `${outputName} is ready to download, but its preview could not be rendered.`,
      progress: 100,
    });
  } catch (error) {
    resetOutput();

    setStatus({
      type: "error",
      symbol: "!",
      title: "Conversion failed",
      message:
        error instanceof Error
          ? error.message
          : `The ${copies}-up PDF could not be created.`,
    });
  } finally {
    setProcessingState(false);
  }
};

// Render the generated Blob with PDF.js. Supplying a typed array means the
// PDF is handed directly to a browser worker; no PDF URL or bytes are sent to
// the CDN that supplied the version-pinned library code.
export const renderOutputPreview = async () => {
  const output = state.output;

  if (!output) {
    return false;
  }

  elements.outputPanel.classList.remove("hidden");
  elements.outputSummary.textContent = `${output.filename} · ${formatBytes(output.size)} · held in memory`;
  elements.previewLoading.classList.remove("hidden");
  elements.pdfPreview.classList.add("hidden");
  elements.previewError.classList.add("hidden");
  elements.openOutputButton.disabled = false;
  elements.downloadOutputButton.disabled = false;

  const token = ++state.previewRenderToken;
  let pdfjs;

  try {
    pdfjs = await window.pdfjsReady;
  } catch {
    pdfjs = null;
  }

  if (token !== state.previewRenderToken || state.output !== output) {
    return false;
  }

  if (!pdfjs?.getDocument) {
    elements.previewLoading.classList.add("hidden");
    elements.previewError.textContent =
      "PDF.js did not load. The generated file is still available to open or download.";
    elements.previewError.classList.remove("hidden");
    return false;
  }

  try {
    const data = new Uint8Array(await output.blob.arrayBuffer());
    const loadingTask = pdfjs.getDocument({ data });
    output.loadingTask = loadingTask;
    const pdfDocument = await loadingTask.promise;

    if (token !== state.previewRenderToken || state.output !== output) {
      await loadingTask.destroy();
      return false;
    }

    const page = await pdfDocument.getPage(1);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const viewportStyles = getComputedStyle(elements.previewViewport);
    const horizontalPadding =
      parseFloat(viewportStyles.paddingLeft) +
      parseFloat(viewportStyles.paddingRight);
    const verticalPadding =
      parseFloat(viewportStyles.paddingTop) +
      parseFloat(viewportStyles.paddingBottom);
    const previewBounds = elements.previewViewport.getBoundingClientRect();
    const availableWidth = Math.max(1, previewBounds.width - horizontalPadding);
    const availableHeight = Math.max(
      1,
      previewBounds.height - verticalPadding,
    );
    // Fit the complete sheet in both dimensions. This works for either
    // portrait or landscape source/output pages without introducing scrollbars.
    const cssScale = Math.min(
      1.5,
      availableWidth / unscaledViewport.width,
      availableHeight / unscaledViewport.height,
    );
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const renderViewport = page.getViewport({ scale: cssScale * pixelRatio });
    const canvas = elements.pdfPreview;
    const context = canvas.getContext("2d", { alpha: false });

    canvas.width = Math.ceil(renderViewport.width);
    canvas.height = Math.ceil(renderViewport.height);
    // Keep the CSS size at the precise fitted dimensions. Rounding it up can
    // make a page overflow its viewport by a pixel and create a scrollbar.
    canvas.style.width = `${renderViewport.width / pixelRatio}px`;
    canvas.style.height = `${renderViewport.height / pixelRatio}px`;

    const renderTask = page.render({
      canvasContext: context,
      viewport: renderViewport,
    });
    output.renderTask = renderTask;
    await renderTask.promise;

    if (token !== state.previewRenderToken || state.output !== output) {
      return false;
    }

    elements.previewLoading.classList.add("hidden");
    canvas.classList.remove("hidden");
    page.cleanup();
    await loadingTask.destroy();
    output.loadingTask = null;
    output.renderTask = null;
    return true;
  } catch (error) {
    if (token !== state.previewRenderToken || state.output !== output) {
      return false;
    }

    output.loadingTask?.destroy();
    output.loadingTask = null;
    output.renderTask = null;
    elements.previewLoading.classList.add("hidden");
    elements.previewError.textContent =
      "The preview could not be rendered. The generated file is still available to open or download.";
    elements.previewError.classList.remove("hidden");
    return false;
  }
};

// Use a download-only MIME type so browsers do not hand the click to their
// built-in PDF viewer. The download attribute supplies the .pdf filename.
export const downloadOutput = () => {
  if (!state.output?.blob || !state.output?.filename) {
    return;
  }

  const downloadBlob = new Blob([state.output.blob], {
    type: "application/octet-stream",
  });
  const downloadUrl = URL.createObjectURL(downloadBlob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = state.output.filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Keep the URL alive until the browser has accepted the click, then release
  // the download-only Blob. The preview's PDF Blob and URL remain available.
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

  setStatus({
    type: "success",
    symbol: "↓",
    title: "Download started",
    message: `${state.output.filename} has been passed to the browser download manager.`,
  });
};

export const openOutput = () => {
  if (!state.output?.url) {
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = state.output.url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
};
