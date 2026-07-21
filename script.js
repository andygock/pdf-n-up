(() => {
  "use strict";

  const STORAGE_KEY = "pdf-4up-state-v1";
  const MAX_FILE_SIZE = 200 * 1024 * 1024;
  const SQRT_2 = Math.sqrt(2);
  const COPY_SCALE = 1 / SQRT_2;
  const POINTS_PER_MM = 72 / 25.4;

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

  const state = {
    ...defaultState,
    source: null,
    output: null,
    processing: false,
    history: [...defaultState.history],
  };

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

  const formatPageSize = (width, height) => {
    const widthMm = pointsToMillimetres(width);
    const heightMm = pointsToMillimetres(height);
    return `${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm`;
  };

  const escapeHtml = (value) => {
    const div = document.createElement("div");
    div.textContent = String(value);
    return div.innerHTML;
  };

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

  const detectPdfSignature = async (file) => {
    const signatureBuffer = await file.slice(0, 5).arrayBuffer();
    const signature = new TextDecoder("ascii").decode(signatureBuffer);
    return signature === "%PDF-";
  };

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

  const revokeOutputUrl = () => {
    if (state.output?.url) {
      URL.revokeObjectURL(state.output.url);
    }
  };

  const resetOutput = () => {
    revokeOutputUrl();
    state.output = null;
    elements.downloadButton.disabled = true;
  };

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
    elements.detailScale.textContent = `${(COPY_SCALE * 100).toFixed(4)}%`;

    elements.outputFilename.textContent = outputName;
    elements.outputPreview.classList.toggle(
      "landscape",
      outputWidth > outputHeight,
    );
  };

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

  const setProcessingState = (processing) => {
    state.processing = processing;

    elements.createButton.disabled = processing || !state.source;
    elements.downloadButton.disabled = processing || !state.output;
    elements.clearButton.disabled = processing || !state.source;
    elements.selectFileButton.disabled = processing;
    elements.fileInput.disabled = processing;
  };

  const openFilePicker = () => {
    if (!state.processing) {
      elements.fileInput.click();
    }
  };

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

      const url = URL.createObjectURL(blob);

      state.output = {
        blob,
        url,
        filename: outputName,
        size: blob.size,
      };

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

  const preventBrowserFileOpen = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

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

  loadPersistedState();
  renderHistory();
  setActiveView(state.activeView);
  clearSource();

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
