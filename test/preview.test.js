import assert from "node:assert/strict";
import test from "node:test";

// Minimal DOM doubles exercise asynchronous preview ownership, not browser
// layout. No browser automation or smoke tests are used by this suite.
const makeElement = () => {
  return {
    hidden: false,
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
globalThis.document = { createElement: makeElement };
globalThis.window = { devicePixelRatio: 1 };
globalThis.getComputedStyle = () => ({
  paddingLeft: "0",
  paddingRight: "0",
  paddingTop: "0",
  paddingBottom: "0",
});
const { createPreviewController } = await import("../src/preview.ts");
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
  size: 3,
});
const library = ({
  loadPromise,
  renderPromise = Promise.resolve(),
  pageWidth = 200,
  pageHeight = 400,
} = {}) => {
  const stats = { destroyed: 0, cancelled: 0 };
  const page = {
    getViewport: ({ scale }) => ({
      width: pageWidth * scale,
      height: pageHeight * scale,
    }),
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
const setup = (options = {}) => {
  const elements = Object.fromEntries(
    [
      "previewViewport",
      "previewLoading",
      "pdfPreview",
      "previewError",
      "retryPreviewButton",
    ].map((key) => [key, makeElement()]),
  );
  const controller = createPreviewController(elements, options);
  const currentOutput = output();
  controller.update(currentOutput, false);
  return { elements, controller, currentOutput };
};

test("hidden views defer preview loading and render when visible again", async () => {
  let loads = 0;
  const { controller, elements, currentOutput } = setup({
    loadLibrary: async () => {
      loads++;
      return library();
    },
  });
  await controller.render();
  assert.equal(loads, 0);
  controller.update(currentOutput, true);
  await controller.render();
  assert.equal(loads, 1);
  assert.equal(elements.pdfPreview.width, 200);
  assert.equal(elements.pdfPreview.height, 400);
  controller.cancel();
});

test("preview timeout destroys the task and leaves output available for retry", async () => {
  let lib = library({ loadPromise: new Promise(() => {}) });
  const { controller, elements, currentOutput } = setup({
    loadLibrary: async () => lib,
    timeoutMs: 10,
  });
  controller.update(currentOutput, true);
  await controller.render();
  assert.equal(lib.stats.destroyed, 1);
  assert.equal(currentOutput.url, "blob:available");
  assert.match(elements.previewError.textContent, /still available/);
  assert.equal(elements.retryPreviewButton.hidden, false);
  lib = library();
  await controller.render();
  assert.equal(elements.pdfPreview.hidden, false);
  assert.equal(elements.retryPreviewButton.hidden, true);
  controller.cancel();
});

test("late library completion cannot render into a replacement output", async () => {
  const waiting = deferred();
  let loadLibrary = () => waiting.promise;
  const { controller, elements, currentOutput } = setup({
    loadLibrary: () => loadLibrary(),
  });
  controller.update(currentOutput, true);
  const oldRender = controller.render();
  controller.cancel();
  loadLibrary = async () => library();
  controller.update(output(), false);
  const replacement = output();
  controller.update(replacement, false);
  controller.update(replacement, true);
  await controller.render();
  const before = elements.pdfPreview.draws;
  waiting.resolve(library());
  await oldRender;
  assert.equal(elements.pdfPreview.draws, before);
  controller.cancel();
});

test("replacing an in-flight render cancels it without stale canvas writes", async () => {
  const pending = deferred();
  let lib = library({ renderPromise: pending.promise });
  const oldLibrary = lib;
  const { controller, elements, currentOutput } = setup({
    loadLibrary: async () => lib,
  });
  controller.update(currentOutput, true);
  const oldRender = controller.render();
  await new Promise((resolve) => setImmediate(resolve));
  controller.cancel();
  assert.equal(oldLibrary.stats.cancelled, 1);
  lib = library();
  const replacement = output();
  controller.update(replacement, false);
  controller.update(replacement, true);
  await controller.render();
  const before = elements.pdfPreview.draws;
  pending.resolve();
  await oldRender;
  assert.equal(elements.pdfPreview.draws, before);
  controller.cancel();
});

test("rerendering after a size change uses the new dimensions", async () => {
  const { controller, elements, currentOutput } = setup({
    loadLibrary: async () => library(),
  });
  elements.previewViewport.getBoundingClientRect = () => ({
    width: 100,
    height: 100,
  });
  controller.update(currentOutput, true);
  await controller.render();
  assert.equal(elements.pdfPreview.width, 50);
  assert.equal(elements.pdfPreview.height, 100);
  controller.cancel();
});

test("hiding the view cancels rendering and clearing output resets the preview", async () => {
  const pending = deferred();
  const lib = library({ renderPromise: pending.promise });
  const { controller, elements, currentOutput } = setup({
    loadLibrary: async () => lib,
  });
  controller.update(currentOutput, true);
  const rendering = controller.render();
  await new Promise((resolve) => setImmediate(resolve));
  controller.update(currentOutput, false);
  assert.equal(lib.stats.cancelled, 1);
  pending.resolve();
  await rendering;
  assert.equal(elements.pdfPreview.draws, 0);
  controller.update(null, false);
  assert.equal(elements.pdfPreview.hidden, true);
  assert.equal(
    elements.previewLoading.textContent,
    "Select a PDF to see the output preview.",
  );
  controller.cancel();
});

test("preview limits pixel density and the canvas area for large pages", async () => {
  globalThis.window.devicePixelRatio = 4;
  const { controller, elements, currentOutput } = setup({
    loadLibrary: async () => library({ pageWidth: 10000, pageHeight: 10000 }),
  });
  elements.previewViewport.getBoundingClientRect = () => ({
    width: 10000,
    height: 10000,
  });
  controller.update(currentOutput, true);
  await controller.render();
  assert.equal(elements.pdfPreview.width, 2000);
  assert.equal(elements.pdfPreview.height, 2000);
  assert.equal(elements.pdfPreview.style.width, "1000px");
  controller.cancel();
  globalThis.window.devicePixelRatio = 1;
});

test("resizing and hiding reuse the document, while replacement and disposal release it", async () => {
  let loads = 0;
  const lib = library();
  const { controller, elements, currentOutput } = setup({
    loadLibrary: async () => {
      loads++;
      return lib;
    },
  });
  let reads = 0;
  const read = currentOutput.blob.arrayBuffer.bind(currentOutput.blob);
  currentOutput.blob.arrayBuffer = () => {
    reads++;
    return read();
  };
  controller.update(currentOutput, true);
  await controller.render();
  elements.previewViewport.getBoundingClientRect = () => ({
    width: 100,
    height: 100,
  });
  controller.schedule();
  await controller.render();
  assert.equal(elements.pdfPreview.height, 100);
  controller.update(currentOutput, false);
  controller.update(currentOutput, true);
  await controller.render();
  assert.equal(loads, 1);
  assert.equal(reads, 1);
  assert.equal(lib.stats.destroyed, 0);
  controller.update(output(), false);
  assert.equal(lib.stats.destroyed, 1);
  controller.cancel();
  assert.equal(lib.stats.destroyed, 1);
});
