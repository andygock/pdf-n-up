import { JSDOM } from "jsdom";

// A DOM emulator exercises React events and elements without launching a browser.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://example.test/",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  get: () => window.navigator,
});
Object.defineProperty(window.navigator, "pdfViewerEnabled", { value: true });
