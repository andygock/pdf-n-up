import assert from "node:assert/strict";
import test from "node:test";

// Minimal DOM doubles exercise asynchronous preview ownership, not browser
// layout. No browser automation or smoke tests are used by this suite.
const makeElement = () => {
  const classes = new Set();
  return {
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
    },
    style: {},
    width: 0,
    height: 0,
    textContent: "",
    draws: 0,
    getContext() {
      return {
        drawImage: () => {
          this.draws++;
        },
      };
    },
    getBoundingClientRect() {
      return { width: 500, height: 400 };
    },
  };
};
const nodes = new Map();
globalThis.document = {
  querySelector: (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, makeElement());
    return nodes.get(selector);
  },
  createElement: makeElement,
};
globalThis.window = { devicePixelRatio: 1 };
globalThis.getComputedStyle = () => ({
  paddingLeft: "0",
  paddingRight: "0",
  paddingTop: "0",
  paddingBottom: "0",
});
const { state, elements } = await import("../js/core.js");
const { renderOutputPreview } = await import("../js/preview.js");

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const output = () => ({
  blob: new Blob(["pdf"]),
  url: "blob:available",
  filename: "test.pdf",
});
const library = ({ loadPromise, renderPromise = Promise.resolve() } = {}) => {
  const stats = { destroyed: 0, cancelled: 0 };
  const page = {
    getViewport: ({ scale }) => ({ width: 200 * scale, height: 400 * scale }),
    render: () => ({
      promise: renderPromise,
      cancel: () => {
        stats.cancelled++;
      },
    }),
    cleanup() {},
  };
  return {
    stats,
    getDocument: () => ({
      promise: loadPromise ?? Promise.resolve({ getPage: async () => page }),
      destroy: async () => {
        stats.destroyed++;
      },
    }),
  };
};

test("hidden views defer preview loading and render when visible again", async () => {
  state.output = output();
  state.activeView = "privacy";
  let loads = 0;
  const loadLibrary = async () => {
    loads++;
    return library();
  };
  await renderOutputPreview({ loadLibrary });
  assert.equal(loads, 0);
  state.activeView = "convert";
  await renderOutputPreview({ loadLibrary });
  assert.equal(loads, 1);
  assert.equal(elements.pdfPreview.width, 200);
  assert.equal(elements.pdfPreview.height, 400);
});

test("preview timeout destroys the task and leaves output available for retry", async () => {
  state.output = output();
  const lib = library({ loadPromise: new Promise(() => {}) });
  await renderOutputPreview({ loadLibrary: async () => lib, timeoutMs: 10 });
  assert.equal(lib.stats.destroyed, 1);
  assert.equal(state.output.url, "blob:available");
  assert.match(elements.previewError.textContent, /still available/);
  assert.equal(elements.retryPreviewButton.classList.contains("hidden"), false);
  await renderOutputPreview({ loadLibrary: async () => library() });
  assert.equal(elements.pdfPreview.classList.contains("hidden"), false);
  assert.equal(elements.retryPreviewButton.classList.contains("hidden"), true);
});

test("late library completion cannot render into a replacement output", async () => {
  const waiting = deferred();
  state.output = output();
  const old = state.output;
  const oldRender = renderOutputPreview({ loadLibrary: () => waiting.promise });
  old.cancelPreview();
  state.output = output();
  await renderOutputPreview({ loadLibrary: async () => library() });
  const before = elements.pdfPreview.draws;
  waiting.resolve(library());
  await oldRender;
  assert.equal(elements.pdfPreview.draws, before);
});

test("replacing an in-flight render cancels it without stale canvas writes", async () => {
  state.output = output();
  const pending = deferred();
  const lib = library({ renderPromise: pending.promise });
  const oldRender = renderOutputPreview({ loadLibrary: async () => lib });
  await new Promise((resolve) => setImmediate(resolve));
  state.output.cancelPreview();
  assert.equal(lib.stats.cancelled, 1);
  state.output = output();
  await renderOutputPreview({ loadLibrary: async () => library() });
  const before = elements.pdfPreview.draws;
  pending.resolve();
  await oldRender;
  assert.equal(elements.pdfPreview.draws, before);
});

test("rerendering after a size change uses the new dimensions", async () => {
  state.output = output();
  elements.previewViewport.getBoundingClientRect = () => ({
    width: 100,
    height: 100,
  });
  await renderOutputPreview({ loadLibrary: async () => library() });
  assert.equal(elements.pdfPreview.width, 50);
  assert.equal(elements.pdfPreview.height, 100);
});
