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
  window.scrollTo({ top: 0, behaviour: "smooth" });
};

// Mobile navigation helpers update the visual classes and aria-expanded value
// together so assistive technology receives the same state as sighted users.
export const openMobileNavigation = () => {
  elements.sidebar.classList.add("open");
  elements.sidebarBackdrop.classList.add("visible");
  elements.mobileMenuButton.setAttribute("aria-expanded", "true");
};

export const closeMobileNavigation = () => {
  elements.sidebar.classList.remove("open");
  elements.sidebarBackdrop.classList.remove("visible");
  elements.mobileMenuButton.setAttribute("aria-expanded", "false");
};

// Prevent the browser's default behaviour of navigating to a dropped file.
// These handlers are registered on window so drops outside the target are safe.
export const preventBrowserFileOpen = (event) => {
  event.preventDefault();
  event.stopPropagation();
};
