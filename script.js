(() => {
  "use strict";

  // Keep all application code inside this immediately invoked function so that
  // constants, state, and helper functions do not leak into the global scope.

  // Browser storage and PDF geometry constants. PDF dimensions are measured in
  // points (72 points per inch), while the interface presents sizes in mm.
  const STORAGE_KEY = "pdf-4up-state-v1";
  const MAX_FILE_SIZE = 200 * 1024 * 1024;
  const SQRT_2 = Math.sqrt(2);
  const COPY_SCALE = 1 / SQRT_2;
  const POINTS_PER_MM = 72 / 25.4;

  // Copy used by the shared page header for each client-side application view.
  const pageTitles = {
    convert: {
      title: "Create a four-up PDF",
      description:
        "Place four copies of one PDF page onto the next ISO paper size.",
    },
    guide: {
      title: "How it works",
      description:
        "Technical details for page scaling, placement and output generation.",
    },
    privacy: {
      title: "Privacy",
      description:
        "How local processing, browser memory and stored metadata are handled.",
    },
  };

  // Only activeView and history are persisted. File objects, parsed PDF bytes,
  // output blobs, and processing flags are deliberately session-only values.
  const defaultState = {
    activeView: "convert",
    source: null,
    output: null,
    processing: false,
    history: [
      {
        id: "example",
        inputName: "Example_A4.pdf",
        outputName: "Example_A4_4up.pdf",
        inputSize: 248320,
        completedAt: "Example record",
        isExample: true,
      },
    ],
  };

  // Clone mutable defaults so clearing or replacing runtime state cannot mutate
  // defaultState and prevent it from being used for error recovery later.
  const state = {
    ...defaultState,
    source: null,
    output: null,
    processing: false,
    history: [...defaultState.history],
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

    outputPreview: document.querySelector("#outputPreview"),
    outputFilename: document.querySelector("#outputFilename"),

    createButton: document.querySelector("#createButton"),
    downloadButton: document.querySelector("#downloadButton"),
    clearButton: document.querySelector("#clearButton"),

    historyList: document.querySelector("#historyList"),
    historyEmpty: document.querySelector("#historyEmpty"),
    clearHistoryButton: document.querySelector("#clearHistoryButton"),
  };

  // Treat localStorage as untrusted input: accept only known view names and
  // history entries with the minimum strings required to render them safely.
  // The history limit also prevents old or manually edited data from growing
  // the page and its storage record without bound.
  const sanitisePersistedState = (parsed) => ({
    activeView:
      typeof parsed?.activeView === "string" &&
      Object.hasOwn(pageTitles, parsed.activeView)
        ? parsed.activeView
        : defaultState.activeView,
    history: Array.isArray(parsed?.history)
      ? parsed.history
          .filter((item) => {
            return (
              item &&
              typeof item.inputName === "string" &&
              typeof item.outputName === "string"
            );
          })
          .slice(0, 10)
      : [...defaultState.history],
  });

  // Restore the small amount of durable UI state. Corrupt JSON, blocked browser
  // storage, and unexpected values all fall back to a clean initial state.
  const loadPersistedState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return;
      }

      const persisted = sanitisePersistedState(JSON.parse(raw));
      state.activeView = persisted.activeView;
      state.history = persisted.history;
    } catch {
      state.activeView = defaultState.activeView;
      state.history = [...defaultState.history];
    }
  };

  // Persist serialisable metadata only. The source PDF and generated output are
  // intentionally never written to storage, keeping document contents local to
  // the current page lifecycle.
  const persistState = () => {
    const persisted = {
      activeView: state.activeView,
      history: state.history.slice(0, 10),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
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

  // pdf-lib reports page dimensions in points; convert both axes for the UI.
  const formatPageSize = (width, height) => {
    const widthMm = pointsToMillimetres(width);
    const heightMm = pointsToMillimetres(height);
    return `${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm`;
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
  const makeOutputFilename = (inputName) => {
    const cleanedName = inputName.trim() || "document.pdf";
    const lastDot = cleanedName.lastIndexOf(".");
    const hasPdfExtension =
      lastDot > 0 && cleanedName.slice(lastDot).toLocaleLowerCase() === ".pdf";

    const basename = hasPdfExtension
      ? cleanedName.slice(0, lastDot)
      : cleanedName;

    return `${basename}_4up.pdf`;
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

  // Invalidate both the generated data and its corresponding download control.
  const resetOutput = () => {
    revokeOutputUrl();
    state.output = null;
    elements.downloadButton.disabled = true;
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
    elements.dropDescription.textContent = "Or select a file from this device.";

    elements.detailsEmpty.classList.remove("hidden");
    elements.detailsList.classList.add("hidden");

    elements.outputFilename.textContent = "Not available";
    elements.outputPreview.classList.remove("landscape");

    elements.createButton.disabled = true;
    elements.downloadButton.disabled = true;
    elements.clearButton.disabled = true;

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

    const { file, width, height, outputWidth, outputHeight, outputName } =
      state.source;

    elements.detailsEmpty.classList.add("hidden");
    elements.detailsList.classList.remove("hidden");

    elements.detailFilename.textContent = file.name;
    elements.detailFileSize.textContent = formatBytes(file.size);
    elements.detailSourceSize.textContent = formatPageSize(width, height);
    elements.detailOutputSize.textContent = formatPageSize(
      outputWidth,
      outputHeight,
    );
    // Each copy is scaled by 1/sqrt(2), the linear ratio between adjacent ISO
    // paper sizes. Four copies therefore fit into a 2-by-2 output arrangement.
    elements.detailScale.textContent = `${(COPY_SCALE * 100).toFixed(4)}%`;

    elements.outputFilename.textContent = outputName;
    elements.outputPreview.classList.toggle(
      "landscape",
      outputWidth > outputHeight,
    );
  };

  // Rebuild the short metadata-only conversion history. All file-derived text
  // is escaped because this list is inserted through innerHTML.
  const renderHistory = () => {
    const items = state.history;

    elements.historyEmpty.classList.toggle("hidden", items.length > 0);
    elements.historyList.classList.toggle("hidden", items.length === 0);
    elements.clearHistoryButton.disabled = items.length === 0;

    elements.historyList.innerHTML = items
      .map((item) => {
        const meta = item.isExample
          ? "Example metadata entry"
          : `${formatBytes(item.inputSize)} · ${item.completedAt}`;

        return `
              <li class="history-item">
                <div>
                  <p class="history-name">${escapeHtml(item.outputName)}</p>
                  <p class="history-meta">
                    From ${escapeHtml(item.inputName)} · ${escapeHtml(meta)}
                  </p>
                </div>
                <span class="history-status">
                  ${item.isExample ? "EXAMPLE" : "COMPLETE"}
                </span>
              </li>
            `;
      })
      .join("");
  };

  // Lock every action that could replace source/output state during conversion,
  // then restore each control according to whether its required data exists.
  const setProcessingState = (processing) => {
    state.processing = processing;

    elements.createButton.disabled = processing || !state.source;
    elements.downloadButton.disabled = processing || !state.output;
    elements.clearButton.disabled = processing || !state.source;
    elements.selectFileButton.disabled = processing;
    elements.fileInput.disabled = processing;
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

    // Multiplying both axes by sqrt(2) produces the next ISO paper size while
    // preserving aspect ratio (for example, A4 becomes A3).
    const outputWidth = width * SQRT_2;
    const outputHeight = height * SQRT_2;
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

    elements.createButton.disabled = false;
    elements.clearButton.disabled = false;

    updateDocumentDetails();

    setStatus({
      type: "success",
      symbol: "✓",
      title: "PDF validated",
      message:
        "The document contains one page and is ready for four-up conversion.",
    });
  };

  // Normalise FileList objects from both the picker and drag-and-drop paths,
  // enforce the single-file rule, and restore a coherent empty UI on failure.
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

  // Create a new, single-page PDF containing four vector-preserving copies of
  // the validated source page. The work happens entirely in browser memory.
  const createFourUpPdf = async () => {
    if (!state.source || state.processing) {
      return;
    }

    setProcessingState(true);
    resetOutput();

    try {
      const { bytes, outputWidth, outputHeight, outputName } = state.source;

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
      outputDocument.setSubject("Four-up PDF layout");
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

      // Divide the output into four equal cells. A 1/sqrt(2)-scale source page
      // matches each cell for standard ISO geometry; offsets also centre copies
      // if input dimensions contain minor rounding or non-standard proportions.
      const cellWidth = outputWidth / 2;
      const cellHeight = outputHeight / 2;

      const drawnWidth = embeddedPage.width * COPY_SCALE;
      const drawnHeight = embeddedPage.height * COPY_SCALE;

      const xOffset = (cellWidth - drawnWidth) / 2;
      const yOffset = (cellHeight - drawnHeight) / 2;

      const placements = [
        { column: 0, row: 1 },
        { column: 1, row: 1 },
        { column: 0, row: 0 },
        { column: 1, row: 0 },
      ];

      setStatus({
        type: "neutral",
        title: "Creating output",
        message: "Placing four copies in a two-by-two arrangement.",
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

      // Store metadata for display, never the source bytes or output Blob. UUIDs
      // are preferred, with a timestamp/random fallback for older browsers.
      const historyEntry = {
        id:
          typeof crypto?.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        inputName: state.source.file.name,
        outputName,
        inputSize: state.source.file.size,
        outputSize: blob.size,
        completedAt: new Intl.DateTimeFormat("en-AU", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date()),
        isExample: false,
      };

      // A real conversion replaces the bundled example and newest entries are
      // kept first. Match the persistence layer's maximum of ten records.
      state.history = [
        historyEntry,
        ...state.history.filter((item) => !item.isExample),
      ].slice(0, 10);

      persistState();
      renderHistory();

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
            : "The four-up PDF could not be created.",
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

  // Switch the visible content panel, synchronise navigation accessibility
  // state and header copy, and remember the choice for the next visit.
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

    persistState();
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

  const clearHistory = () => {
    state.history = [];
    persistState();
    renderHistory();
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

  elements.createButton.addEventListener("click", createFourUpPdf);
  elements.downloadButton.addEventListener("click", downloadOutput);
  elements.clearButton.addEventListener("click", () => clearSource());
  elements.clearHistoryButton.addEventListener("click", clearHistory);

  window.addEventListener("beforeunload", revokeOutputUrl);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileNavigation();
    }
  });

  // Initialisation order matters: restore durable metadata, render it, select
  // the restored view, and finally reset transient document/output controls.
  loadPersistedState();
  renderHistory();
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
