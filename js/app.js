import {
  elements,
  LAYOUTS,
  removeLegacyPersistedState,
  state,
  syncOptionsFromDom,
} from "./core.js";
import {
  clearSource,
  openFilePicker,
  resetOutput,
  revokeOutputUrl,
  setStatus,
  updateDocumentDetails,
} from "./ui.js";
import {
  createNUpPdf,
  downloadOutput,
  handleSelectedFiles,
  openOutput,
  renderOutputPreview,
} from "./pdf.js";
import {
  closeMobileNavigation,
  openMobileNavigation,
  preventBrowserFileOpen,
  setActiveView,
} from "./navigation.js";

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

elements.downloadOutputButton.addEventListener("click", downloadOutput);
elements.openOutputButton.addEventListener("click", openOutput);

// A resized browser window can change the usable preview height as well as its
// width. Re-render the canvas so the entire generated sheet stays in view.
let previewResizeTimer;
const refitPreview = () => {
  clearTimeout(previewResizeTimer);
  previewResizeTimer = setTimeout(() => {
    if (state.output && !state.processing) {
      renderOutputPreview();
    }
  }, 150);
};

if ("ResizeObserver" in window) {
  new ResizeObserver(refitPreview).observe(elements.previewViewport);
} else {
  window.addEventListener("resize", refitPreview);
}

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

  // The validated source bytes remain in memory, so option changes can
  // immediately replace the preview without asking the user for the file
  // again. createNUpPdf manages its own progress and error states.
  if (state.source) {
    createNUpPdf();
  }
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
syncOptionsFromDom();
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
