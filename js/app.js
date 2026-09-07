import {
  elements,
  removeLegacyPersistedState,
  state,
  syncOptionsFromDom,
} from "./core.js";
import { LAYOUTS } from "./geometry.js";
import {
  clearSource,
  openFilePicker,
  resetOutput,
  updateDocumentDetails,
} from "./ui.js";
import {
  createNUpPdf,
  downloadOutput,
  handleSelectedFiles,
  openOutput,
  clearDocument,
} from "./pdf.js";
import {
  closeMobileNavigation,
  openMobileNavigation,
  preventBrowserFileOpen,
  setActiveView,
  initialiseNavigation,
} from "./navigation.js";
import { initialisePreview } from "./preview.js";

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

elements.replaceFileButton.addEventListener("click", openFilePicker);

elements.fileInput.addEventListener("change", (event) => {
  handleSelectedFiles(event.target.files);
});

elements.downloadOutputButton.addEventListener("click", downloadOutput);
elements.openOutputButton.addEventListener("click", openOutput);
elements.clearDocumentButton.addEventListener("click", clearDocument);
elements.cancelButton.addEventListener("click", clearDocument);
elements.useSourceSizeButton.addEventListener("click", () => {
  document.querySelector('input[name="paperMode"][value="same"]').checked =
    true;
  syncOptionsFromDom();
  updateDocumentDetails();
  void createNUpPdf();
});

document.addEventListener("change", (event) => {
  if (state.processing) return;
  if (event.target.matches('input[name="layout"]')) {
    state.layout = LAYOUTS[event.target.value] || LAYOUTS[4];
  } else if (event.target.matches('input[name="paperMode"]')) {
    state.paperMode = event.target.value === "same" ? "same" : "expand";
  } else if (event.target.matches("#marginMm, #gutterMm")) {
    syncOptionsFromDom();
  } else {
    return;
  }

  resetOutput();
  updateDocumentDetails();

  // The validated source remains in the worker, so option changes can
  // immediately replace the preview without asking the user for the file
  // again. createNUpPdf manages its own progress and error states.
  if (state.source) {
    void createNUpPdf();
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

window.addEventListener("pagehide", (event) => {
  // Preserve live state when entering the back/forward cache. A cancelled
  // navigation must never revoke URLs still used by the current page.
  if (!event.persisted) clearDocument();
});

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
initialiseNavigation();
initialisePreview();
