(() => {
  "use strict";

  // Keep all application code inside this immediately invoked function so that
  // constants, state, and helper functions do not leak into the global scope.

  // PDF dimensions are measured in points (72 points per inch), while the
  // interface presents sizes in mm.
  const LEGACY_STORAGE_KEY = "pdf-4up-state-v1";
  const MAX_FILE_SIZE = 200 * 1024 * 1024;
  const POINTS_PER_MM = 72 / 25.4;
  const LAYOUTS = {
    2: { copies: 2, columns: 2, rows: 1 },
    4: { copies: 4, columns: 2, rows: 2 },
    8: { copies: 8, columns: 4, rows: 2 },
    9: { copies: 9, columns: 3, rows: 3 },
    16: { copies: 16, columns: 4, rows: 4 },
  };
  const STANDARD_PAPER_SIZES = [
    ["A0", 841, 1189], ["A1", 594, 841], ["A2", 420, 594],
    ["A3", 297, 420], ["A4", 210, 297], ["A5", 148, 210],
    ["A6", 105, 148], ["A7", 74, 105], ["A8", 52, 74],
    ["A9", 37, 52], ["A10", 26, 37], ["Letter", 215.9, 279.4],
    ["Legal", 215.9, 355.6], ["Tabloid", 279.4, 431.8],
    ["Executive", 184.2, 266.7],
  ];

  // Copy used by the shared page header for each client-side application view.
  const pageTitles = {
    convert: {
      title: "Create an N-up PDF",
      description:
        "Arrange repeated copies of one PDF page on a single sheet.",
    },
    guide: {
      title: "How it works",
      description:
        "Technical details for page scaling, placement and output generation.",
    },
    privacy: {
      title: "Privacy",
      description:
        "How local processing and browser memory are handled.",
    },
  };

  const defaultState = {
    activeView: "convert",
    source: null,
    output: null,
    processing: false,
    layout: LAYOUTS[4],
    paperMode: "expand",
  };

  const state = {
    ...defaultState,
  };

  // Cache frequently used DOM nodes once. The HTML contract requires each of
  // these IDs to exist before this script runs.
  const elements = {
    sidebar: document.querySelector("#sidebar"),
    sidebarBackdrop: document.querySelector("#sidebarBackdrop"),
    mobileMenuButton: document.querySelector("#mobileMenuButton"),
    pageTitle: document.querySelector("#pageTitle"),
    pageDescription: document.querySelector("#pageDescription"),

    fileInput: document.querySelector("#fileInput"),
    selectFileButton: document.querySelector("#selectFileButton"),
    dropZone: document.querySelector("#dropZone"),
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
  };

  // Remove metadata written by versions that kept a recent-conversion history.
  // No new application state is written to persistent browser storage.
  const removeLegacyPersistedState = () => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // The application remains functional when browser storage is blocked.
    }
  };

  // Format byte counts with decimal (base-1000) units for display. Precision is
  // reduced as values grow so labels remain compact and easy to scan.
  const formatBytes = (bytes) => {
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

  const pointsToMillimetres = (points) => points / POINTS_PER_MM;

  const findPaperName = (widthMm, heightMm) => {
    const toleranceMm = 1;
    return STANDARD_PAPER_SIZES.find(([, standardWidth, standardHeight]) =>
      (Math.abs(widthMm - standardWidth) <= toleranceMm && Math.abs(heightMm - standardHeight) <= toleranceMm) ||
      (Math.abs(widthMm - standardHeight) <= toleranceMm && Math.abs(heightMm - standardWidth) <= toleranceMm),
    )?.[0];
  };

  // pdf-lib reports page dimensions in points; convert both axes for the UI.
  const formatPageSize = (width, height) => {
    const widthMm = pointsToMillimetres(width);
    const heightMm = pointsToMillimetres(height);
    const paperName = findPaperName(widthMm, heightMm);
    return `${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm${paperName ? ` (${paperName})` : ""}`;
  };

  // Layout labels describe portrait input. Transpose rectangular grids for a
  // landscape source so sheets grow along the source's shorter axis and no
  // empty rows or columns are introduced.
  const getResolvedLayout = (width, height) => {
    const { copies, columns, rows } = state.layout;
    return width > height
      ? { copies, columns: rows, rows: columns }
      : { copies, columns, rows };
  };

  const getOutputGeometry = (width, height) => {
    const { columns, rows } = getResolvedLayout(width, height);
    const scale = state.paperMode === "expand" ? 1 : Math.min(1 / columns, 1 / rows);
    return {
      outputWidth: state.paperMode === "expand" ? width * columns : width,
      outputHeight: state.paperMode === "expand" ? height * rows : height,
      scale,
    };
  };

  // History rows are assembled as HTML strings. Passing user-controlled names
  // through a temporary element converts markup characters into safe entities.
  const escapeHtml = (value) => {
    const div = document.createElement("div");
    div.textContent = String(value);
    return div.innerHTML;
  };

  // Preserve the user's basename, replace a final .pdf suffix when present,
  // and supply a useful name even if the browser reports a blank filename.
  const makeOutputFilename = (inputName, copies = state.layout.copies) => {
    const cleanedName = inputName.trim() || "document.pdf";
    const lastDot = cleanedName.lastIndexOf(".");
    const hasPdfExtension =
      lastDot > 0 && cleanedName.slice(lastDot).toLocaleLowerCase() === ".pdf";

    const basename = hasPdfExtension
      ? cleanedName.slice(0, lastDot)
      : cleanedName;

    return `${basename}_${copies}up.pdf`;
  };

  // Extension checks improve error messages, but the PDF magic bytes provide a
  // quick content check before the entire (potentially large) file is loaded.
  const detectPdfSignature = async (file) => {
    const signatureBuffer = await file.slice(0, 5).arrayBuffer();
    const signature = new TextDecoder("ascii").decode(signatureBuffer);
    return signature === "%PDF-";
  };

  // Central status renderer keeps colour, icon, message, spinner, and progress
  // behaviour consistent across validation, conversion, and download actions.
  const setStatus = ({
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
  const revokeOutputUrl = () => {
    if (state.output?.url) {
      URL.revokeObjectURL(state.output.url);
    }
  };

  // Invalidate generated data and release its temporary object URL.
  const resetOutput = () => {
    revokeOutputUrl();
    state.output = null;
  };

  // Return all source-dependent controls and labels to their initial state.
  // Callers may override the status copy to explain why the reset occurred.
  const clearSource = ({
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
      "Or select a file. Valid PDFs convert and download automatically.";

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
  const updateDocumentDetails = () => {
    if (!state.source) {
      elements.detailsEmpty.classList.remove("hidden");
      elements.detailsList.classList.add("hidden");
      return;
    }

    const { file, width, height } = state.source;
    const { outputWidth, outputHeight, scale } = getOutputGeometry(width, height);
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
  const setProcessingState = (processing) => {
    state.processing = processing;

    elements.selectFileButton.disabled = processing;
    elements.fileInput.disabled = processing;
    document.querySelectorAll('input[name="layout"], input[name="paperMode"]').forEach((input) => {
      input.disabled = processing;
    });
  };

  // Programmatically opening the hidden input gives the drop zone and explicit
  // select button one shared file-selection path.
  const openFilePicker = () => {
    if (!state.processing) {
      elements.fileInput.click();
    }
  };

  // Validate a candidate file from cheapest checks to most expensive checks,
  // then retain its bytes and dimensions for conversion. Errors are surfaced by
  // handleSelectedFiles so this function can use ordinary exceptions throughout.
  const validateAndLoadFile = async (file) => {
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
      message:
        `The document contains one page and is ready for ${state.layout.copies}-up conversion.`,
    });
  };

  // Normalise FileList objects from both the picker and drag-and-drop paths,
  // enforce the single-file rule, then convert and download valid input.
  const handleSelectedFiles = async (files) => {
    if (state.processing) {
      return;
    }

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

      if (state.output) {
        downloadOutput();
      }
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
  const createNUpPdf = async () => {
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
      const { outputWidth, outputHeight, scale } = getOutputGeometry(state.source.width, state.source.height);
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
      outputDocument.setCreator("PDF 4-Up browser application");
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
        type: "success",
        symbol: "✓",
        title: "Output ready",
        message: `${outputName} was created successfully (${formatBytes(blob.size)}).`,
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

  // Trigger the browser's native download manager with a short-lived anchor.
  // The object URL remains valid for repeat downloads until output is cleared.
  const downloadOutput = () => {
    if (!state.output?.url || !state.output?.filename) {
      return;
    }

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

  // Switch the visible content panel and synchronise navigation accessibility
  // state and header copy for the current page session.
  const setActiveView = (viewName) => {
    if (!Object.hasOwn(pageTitles, viewName)) {
      return;
    }

    state.activeView = viewName;

    document.querySelectorAll("[data-view-container]").forEach((view) => {
      view.classList.toggle("hidden", view.dataset.viewContainer !== viewName);
    });

    document.querySelectorAll("[data-view]").forEach((button) => {
      const active = button.dataset.view === viewName;
      button.classList.toggle("active", active);

      if (active) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    elements.pageTitle.textContent = pageTitles[viewName].title;
    elements.pageDescription.textContent = pageTitles[viewName].description;

    closeMobileNavigation();
    window.scrollTo({ top: 0, behaviour: "smooth" });
  };

  // Mobile navigation helpers update the visual classes and aria-expanded value
  // together so assistive technology receives the same state as sighted users.
  const openMobileNavigation = () => {
    elements.sidebar.classList.add("open");
    elements.sidebarBackdrop.classList.add("visible");
    elements.mobileMenuButton.setAttribute("aria-expanded", "true");
  };

  const closeMobileNavigation = () => {
    elements.sidebar.classList.remove("open");
    elements.sidebarBackdrop.classList.remove("visible");
    elements.mobileMenuButton.setAttribute("aria-expanded", "false");
  };

  // Prevent the browser's default behaviour of navigating to a dropped file.
  // These handlers are registered on window so drops outside the target are safe.
  const preventBrowserFileOpen = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  // Navigation uses event delegation because every view button shares the same
  // data-view contract, including any buttons added to the markup later.
  document.addEventListener("click", (event) => {
    const navButton = event.target.closest("[data-view]");

    if (navButton) {
      setActiveView(navButton.dataset.view);
    }
  });

  elements.mobileMenuButton.addEventListener("click", () => {
    const isOpen = elements.sidebar.classList.contains("open");

    if (isOpen) {
      closeMobileNavigation();
    } else {
      openMobileNavigation();
    }
  });

  elements.sidebarBackdrop.addEventListener("click", closeMobileNavigation);

  elements.selectFileButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openFilePicker();
  });

  elements.dropZone.addEventListener("click", (event) => {
    if (event.target === elements.selectFileButton) {
      return;
    }

    openFilePicker();
  });

  elements.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFilePicker();
    }
  });

  elements.fileInput.addEventListener("change", (event) => {
    handleSelectedFiles(event.target.files);
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches('input[name="layout"]')) {
      state.layout = LAYOUTS[event.target.value] || LAYOUTS[4];
    } else if (event.target.matches('input[name="paperMode"]')) {
      state.paperMode = event.target.value === "same" ? "same" : "expand";
    } else {
      return;
    }

    resetOutput();
    updateDocumentDetails();
  });

  // First suppress browser-wide file navigation, then add drop-zone-only visual
  // feedback and pass the dropped FileList into the shared selection pipeline.
  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    window.addEventListener(eventName, preventBrowserFileOpen);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, () => {
      if (!state.processing) {
        elements.dropZone.classList.add("dragging");
      }
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, () => {
      elements.dropZone.classList.remove("dragging");
    });
  });

  elements.dropZone.addEventListener("drop", (event) => {
    handleSelectedFiles(event.dataTransfer?.files);
  });

  window.addEventListener("beforeunload", revokeOutputUrl);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileNavigation();
    }
  });

  // Remove data left by older releases, then initialise session-only state.
  removeLegacyPersistedState();
  setActiveView(state.activeView);
  clearSource();

  // The external library is required for both validation and conversion. Disable
  // file selection up front when it failed to load instead of failing later.
  if (!window.PDFLib?.PDFDocument) {
    setStatus({
      type: "error",
      symbol: "!",
      title: "PDF library unavailable",
      message:
        "The PDF processing library could not be loaded. Reload the page after checking the network connection.",
    });

    elements.selectFileButton.disabled = true;
    elements.fileInput.disabled = true;
  }
})();
