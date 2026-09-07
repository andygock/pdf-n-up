import { elements, pageTitles, state } from "./core.js";

// Switch the visible content panel and synchronise navigation accessibility
// state and header copy for the current page session.
export const setActiveView = (viewName) => {
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
  document.dispatchEvent(new Event("viewchange"));
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// Mobile navigation helpers update the visual classes and aria-expanded value
// together so assistive technology receives the same state as sighted users.
export const openMobileNavigation = () => {
  elements.sidebar.classList.add("open");
  elements.sidebarBackdrop.classList.add("visible");
  elements.mobileMenuButton.setAttribute("aria-expanded", "true");
  elements.sidebar.inert = false;
  elements.appArea.inert = true;
  elements.sidebar.querySelector("[data-view]").focus();
};

export const closeMobileNavigation = () => {
  const wasOpen = elements.sidebar.classList.contains("open");
  elements.sidebar.classList.remove("open");
  elements.sidebarBackdrop.classList.remove("visible");
  elements.mobileMenuButton.setAttribute("aria-expanded", "false");
  elements.appArea.inert = false;
  elements.sidebar.inert = window.matchMedia("(max-width: 900px)").matches;
  if (wasOpen) elements.mobileMenuButton.focus();
};

export const initialiseNavigation = () => {
  const mobile = window.matchMedia("(max-width: 900px)");
  mobile.addEventListener("change", closeMobileNavigation);
  closeMobileNavigation();
  // Keep Tab inside the open drawer; Escape/backdrop closes it and restores
  // focus to the menu trigger. Closed off-screen links are inert on mobile.
  elements.sidebar.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || !elements.sidebar.classList.contains("open"))
      return;
    const buttons = Array.from(
      elements.sidebar.querySelectorAll("button:not(:disabled)"),
    );
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
};

// Prevent the browser's default behaviour of navigating to a dropped file.
// These handlers are registered on window so drops outside the target are safe.
export const preventBrowserFileOpen = (event) => {
  event.preventDefault();
  event.stopPropagation();
};
