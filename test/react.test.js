import "./dom.js";
import assert from "node:assert/strict";
import test from "node:test";
import * as pdfLib from "pdf-lib";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import App from "../src/App.tsx";
import { createArchive } from "../src/archive.ts";
import { createConversionEngine } from "../src/conversion.ts";
import { LAYOUTS } from "../src/geometry.ts";
import { Modal } from "../src/Modal.tsx";
import { Preview } from "../src/Preview.tsx";
import { SpacingInput } from "../src/SpacingInput.tsx";
import { useBatch } from "../src/useBatch.ts";
import { useConversion } from "../src/useConversion.ts";
import { WorkerLostError } from "../src/worker-client.ts";

const create = (element) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  root.render(element);
  return {
    container,
    update: (next) => root.render(next),
    unmount() {
      root.unmount();
      container.remove();
    },
  };
};

const makeWorker = () => {
  const engine = createConversionEngine(pdfLib);
  return {
    loads: 0,
    dispose() {},
    request(method, payload) {
      if (method === "load") {
        this.loads++;
        return engine.load(payload.bytes, payload.metadata);
      }
      if (method === "selectPage") return engine.selectPage(payload);
      return engine.generate(payload);
    },
  };
};
const mountConversion = async (worker = makeWorker()) => {
  let value;
  let root;
  function Harness() {
    value = useConversion(() => worker);
    return null;
  }
  await act(() => {
    root = create(createElement(Harness));
  });
  return {
    get value() {
      return value;
    },
    worker,
    close: () => act(() => root.unmount()),
  };
};
const file = async (width = 100, height = 200) => {
  const doc = await pdfLib.PDFDocument.create();
  doc.addPage([width, height]);
  return new File([await doc.save()], "handout.pdf", {
    type: "application/pdf",
  });
};

test("React conversion retains the source and regenerates every layout and paper mode", async () => {
  const app = await mountConversion();
  try {
    await act(async () => app.value.selectFiles([await file()]));
    assert.equal(app.value.status.title, "Output ready");
    assert.equal(app.value.processing, false);
    const oldUrl = app.value.output.url;
    for (const layout of Object.values(LAYOUTS)) {
      for (const paperMode of ["expand", "same"]) {
        await act(() => app.value.changeOptions({ layout, paperMode }));
        const output = await pdfLib.PDFDocument.load(
          await app.value.output.blob.arrayBuffer(),
        );
        assert.equal(output.getPageCount(), 1);
        assert.equal(
          app.value.output.filename,
          `handout_${layout.copies}up.pdf`,
        );
        assert.equal(app.value.processing, false);
      }
    }
    assert.equal(app.worker.loads, 1);
    await assert.rejects(fetch(oldUrl));
    await act(() => app.value.changeOptions({ marginMm: 100, gutterMm: 100 }));
    assert.equal(app.value.status.title, "Conversion failed");
    assert.equal(app.value.details.outputSize, "Spacing does not fit");
    assert.ok(app.value.source);
    assert.equal(app.value.output, null);
    await act(() => app.value.changeOptions({ marginMm: 0, gutterMm: 0 }));
    assert.equal(app.value.status.title, "Output ready");
    const url = app.value.output.url;
    await act(() => app.value.clearDocument());
    assert.equal(app.value.source, null);
    assert.equal(app.value.output, null);
    await assert.rejects(fetch(url));
  } finally {
    await app.close();
  }
});

test("React recovers from oversized output using the retained source", async () => {
  const app = await mountConversion();
  try {
    await act(async () => app.value.selectFiles([await file(8000, 8000)]));
    assert.equal(app.value.failed, true);
    assert.ok(app.value.source);
    await act(() => app.value.changeOptions({ paperMode: "same" }));
    assert.equal(app.value.status.title, "Output ready");
    assert.equal(app.worker.loads, 1);
  } finally {
    await app.close();
  }
});

test("React validates file selection and preserves output on multiple-file rejection", async () => {
  const app = await mountConversion();
  try {
    for (const [input, message] of [
      [new File([], "empty.pdf"), /empty/],
      [new File(["%PDF-"], "wrong.txt"), /extension/],
      [new File(["not a PDF"], "wrong.pdf"), /header/],
    ]) {
      await act(() => app.value.selectFiles([input]));
      assert.match(app.value.status.message, message);
      assert.equal(app.value.processing, false);
    }
    const input = await file();
    await act(() => app.value.selectFiles([input]));
    const output = app.value.output;
    await act(() => app.value.selectFiles([input, input]));
    assert.equal(app.value.status.title, "Multiple files rejected");
    assert.equal(app.value.output, output);
  } finally {
    await app.close();
  }
});

test("cancelling a pending file read prevents late validation and worker requests", async () => {
  const app = await mountConversion();
  let cancelled = false;
  const input = new File(["%PDF-"], "slow.pdf");
  input.stream = () =>
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
  try {
    let pending;
    await act(async () => {
      pending = app.value.selectFiles([input]);
      await new Promise((resolve) => setImmediate(resolve));
    });
    assert.equal(app.value.processing, true);
    await act(async () => {
      app.value.clearDocument();
      await pending;
    });
    assert.equal(cancelled, true);
    assert.equal(app.value.status.title, "Ready");
    assert.equal(app.worker.loads, 0);
    assert.equal(app.value.processing, false);
  } finally {
    await app.close();
  }
});

test("worker loss clears the React source and unlocks file selection", async () => {
  const worker = makeWorker();
  const app = await mountConversion(worker);
  try {
    await act(async () => app.value.selectFiles([await file()]));
    worker.request = async () => {
      throw new WorkerLostError("Worker stopped");
    };
    await act(() => app.value.changeOptions({ layout: LAYOUTS[8] }));
    assert.equal(app.value.status.message, "Worker stopped");
    assert.equal(app.value.source, null);
    assert.equal(app.value.output, null);
    assert.equal(app.value.processing, false);
  } finally {
    await app.close();
  }
});

test("pagehide preserves cached documents and releases uncached documents", async () => {
  const app = await mountConversion();
  try {
    await act(async () => app.value.selectFiles([await file()]));
    await act(() =>
      window.dispatchEvent(
        new window.PageTransitionEvent("pagehide", { persisted: true }),
      ),
    );
    assert.ok(app.value.output);
    await act(() =>
      window.dispatchEvent(
        new window.PageTransitionEvent("pagehide", { persisted: false }),
      ),
    );
    assert.equal(app.value.output, null);
  } finally {
    await app.close();
  }
});

test("Download saves the PDF bytes under the chosen filename", async () => {
  const app = await mountConversion();
  let written;
  let closed = false;
  window.showSaveFilePicker = async ({ suggestedName }) => {
    assert.equal(suggestedName, "handout_4up.pdf");
    return {
      name: "chosen.pdf",
      createWritable: async () => ({
        write: async (blob) => {
          written = await blob.arrayBuffer();
        },
        close: async () => {
          closed = true;
        },
      }),
    };
  };
  try {
    await act(async () => app.value.selectFiles([await file()]));
    const expected = await app.value.output.blob.arrayBuffer();
    await act(() => app.value.openOutput("save"));
    assert.deepEqual(written, expected);
    assert.equal(closed, true);
    assert.equal(app.value.status.title, "PDF saved");
    assert.match(app.value.status.message, /chosen\.pdf/);
  } finally {
    delete window.showSaveFilePicker;
    await app.close();
  }
});

test("Download cancellation and write failure preserve the generated PDF", async () => {
  const app = await mountConversion();
  try {
    await act(async () => app.value.selectFiles([await file()]));
    const output = app.value.output;
    window.showSaveFilePicker = async () => {
      throw new DOMException("Cancelled", "AbortError");
    };
    await act(() => app.value.openOutput("save"));
    assert.equal(app.value.status.title, "Output ready");
    let aborted = false;
    window.showSaveFilePicker = async () => ({
      name: "chosen.pdf",
      createWritable: async () => ({
        write: async () => {
          throw new Error("Disk full");
        },
        abort: async () => {
          aborted = true;
        },
      }),
    });
    await act(() => app.value.openOutput("save"));
    assert.equal(aborted, true);
    assert.equal(app.value.status.title, "Download failed");
    assert.equal(app.value.status.message, "Disk full");
    assert.equal(app.value.output, output);
    assert.equal(app.value.failed, false);
  } finally {
    delete window.showSaveFilePicker;
    await app.close();
  }
});

test("fallback Download preserves PDF bytes and Open uses the PDF URL", async (t) => {
  const app = await mountConversion();
  const anchors = [];
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      click() {
        anchors.push(this);
      },
      remove() {},
    }),
    body: { append() {} },
  };
  let revoke;
  t.mock.method(globalThis, "setTimeout", (callback) => {
    revoke = callback;
  });
  try {
    await act(async () => app.value.selectFiles([await file()]));
    await act(() => app.value.openOutput("save"));
    assert.equal(anchors[0].download, "handout_4up.pdf");
    assert.equal(anchors[0].target, undefined);
    const downloaded = await (await fetch(anchors[0].href)).blob();
    assert.equal(downloaded.type, "application/octet-stream");
    assert.deepEqual(
      await downloaded.arrayBuffer(),
      await app.value.output.blob.arrayBuffer(),
    );
    revoke();
    await assert.rejects(fetch(anchors[0].href));
    await act(() => app.value.openOutput("open"));
    assert.equal(anchors[1].href, app.value.output.url);
    assert.equal(app.value.output.blob.type, "application/pdf");
    assert.equal(anchors[1].target, "_blank");
    assert.equal(anchors[1].download, undefined);
  } finally {
    globalThis.document = previousDocument;
    await app.close();
  }
});

test("native preview hides, resumes, regenerates and clears its frame", async () => {
  const app = await mountConversion();
  let root;
  const render = (active = true) =>
    createElement(Preview, {
      output: app.value.output,
      active,
      nativeViewer: true,
    });
  try {
    await act(() => {
      root = create(render());
    });
    assert.equal(root.container.querySelector("iframe"), null);
    await act(async () => app.value.selectFiles([await file()]));
    await act(() => root.update(render()));
    const firstUrl = app.value.output.url;
    assert.equal(
      root.container.querySelector("iframe").getAttribute("src"),
      `${firstUrl}#filename=handout_4up.pdf&zoom=page-fit`,
    );
    await act(() => root.update(render(false)));
    assert.equal(root.container.querySelector("iframe"), null);
    await act(() => root.update(render()));
    assert.ok(root.container.querySelector("iframe"));
    await act(() => app.value.changeOptions({ layout: LAYOUTS[8] }));
    await act(() => root.update(render()));
    assert.match(
      root.container.querySelector("iframe").getAttribute("src"),
      /filename=handout_8up.pdf/,
    );
    await assert.rejects(fetch(firstUrl));
    await act(() => app.value.clearDocument());
    await act(() => root.update(render()));
    assert.equal(root.container.querySelector("iframe"), null);
  } finally {
    if (root) await act(() => root.unmount());
    await app.close();
  }
});

test("empty state and navigation use accessible DOM controls", async () => {
  let root;
  await act(() => {
    root = create(createElement(App));
  });
  const query = (selector) => root.container.querySelector(selector);
  try {
    assert.equal(query("#downloadOutputButton"), null);
    assert.equal(query("#statusBox"), null);
    assert.equal(query('input[name="layout"][value="4"]').checked, true);
    assert.equal(query('select[aria-label="Output paper"]').value, "expand");
    for (const view of ["privacy", "guide", "convert"]) {
      await act(async () => {
        query(`footer a[data-view="${view}"]`).click();
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      assert.equal(query(`#view-${view}`).hidden, false);
      assert.equal(
        document.activeElement?.id,
        view === "convert" ? "selectFileButton" : "pageTitle",
      );
    }
  } finally {
    await act(() => root.unmount());
    window.history.replaceState(null, "", "/");
  }
});

const drag = (name, files = [], types = ["Files"]) => {
  const event = new window.Event(name, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files, types } });
  return event;
};

test("viewport drag events validate files and reset the overlay", async () => {
  let root;
  await act(() => {
    root = create(createElement(App));
  });
  const overlay = () => root.container.querySelector("#dropOverlay");
  try {
    await act(() =>
      window.dispatchEvent(drag("dragenter", [], ["text/plain"])),
    );
    assert.equal(overlay(), null);
    await act(() => window.dispatchEvent(drag("dragenter")));
    await act(() => window.dispatchEvent(drag("dragenter")));
    await act(() => window.dispatchEvent(drag("dragleave")));
    assert.ok(overlay());
    const over = drag("dragover");
    await act(() => window.dispatchEvent(over));
    assert.equal(over.defaultPrevented, true);
    assert.equal(over.dataTransfer.dropEffect, "copy");
    const event = drag("drop", [new File(["wrong"], "wrong.pdf")]);
    await act(async () => {
      window.dispatchEvent(event);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.equal(event.defaultPrevented, true);
    assert.equal(overlay(), null);
    assert.equal(
      root.container.querySelector("#statusTitle").textContent,
      "File rejected",
    );
    await act(() => window.dispatchEvent(drag("dragenter")));
    await act(() => window.dispatchEvent(new window.Event("blur")));
    assert.equal(overlay(), null);
  } finally {
    await act(() => root.unmount());
    window.history.replaceState(null, "", "/");
  }
});

test("dropping converts and replaces PDFs with a save action in native mode", async () => {
  const previousWorker = globalThis.Worker;
  const workers = [];
  globalThis.Worker = class {
    engine = makeWorker();
    active = true;
    constructor() {
      workers.push(this);
    }
    async postMessage({ id, method, payload }) {
      const result = await this.engine.request(method, payload);
      if (this.active) this.onmessage({ data: { id, result } });
    }
    terminate() {
      this.active = false;
    }
  };
  let root;
  window.history.replaceState(null, "", "/#view-privacy");
  await act(() => {
    root = create(createElement(App));
  });
  const drop = async (input) => {
    await act(() => window.dispatchEvent(drag("drop", [input])));
    for (let attempt = 0; attempt < 100; attempt++) {
      await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
      if (
        root.container.querySelector("#statusTitle")?.textContent ===
        "Output ready"
      )
        return;
    }
    assert.fail("conversion did not complete");
  };
  try {
    await drop(await file());
    assert.equal(root.container.querySelector("#view-convert").hidden, false);
    assert.equal(
      root.container.querySelector("#dropTitle").textContent,
      "handout.pdf",
    );
    assert.equal(workers.length, 1);
    assert.equal(workers[0].engine.loads, 1);
    const firstUrl = root.container
      .querySelector("iframe")
      .getAttribute("src")
      .split("#")[0];
    assert.equal(
      root.container.querySelector("#downloadOutputButton").disabled,
      false,
    );
    await drop(
      new File([await (await file()).arrayBuffer()], "replacement.pdf"),
    );
    assert.equal(workers.length, 2);
    assert.equal(workers[1].engine.loads, 1);
    assert.match(
      root.container.querySelector("iframe").getAttribute("src"),
      /replacement_4up.pdf/,
    );
    await assert.rejects(fetch(firstUrl));
  } finally {
    await act(() => root.unmount());
    window.history.replaceState(null, "", "/");
    if (previousWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = previousWorker;
  }
});

test("spacing drafts commit after an idle delay through DOM events", async () => {
  let root;
  const commits = [];
  await act(() => {
    root = create(
      createElement(SpacingInput, {
        id: "spacing-test",
        disabled: false,
        value: 0,
        onCommit: (value) => commits.push(value),
      }),
    );
  });
  try {
    const input = root.container.querySelector("input");
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    await act(() => {
      input.focus();
      setValue.call(input, "12.5");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    assert.deepEqual(commits, []);
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    assert.deepEqual(commits, [12.5]);
    await act(() => {
      input.focus();
      setValue.call(input, "20");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    assert.deepEqual(commits, [12.5, 20]);
  } finally {
    await act(() => root.unmount());
  }
});

test("modal trigger uses the labelled native dialog and a dialog close form", async () => {
  let root;
  await act(() => {
    root = create(
      createElement(Modal, { title: "Details" }, "Document information"),
    );
  });
  try {
    const dialog = root.container.querySelector("dialog");
    let opened = false;
    // jsdom does not implement the browser's modal top layer.
    dialog.showModal = () => {
      opened = true;
    };
    await act(() =>
      root.container.querySelector('[aria-haspopup="dialog"]').click(),
    );
    assert.equal(opened, true);
    assert.equal(
      document.getElementById(dialog.getAttribute("aria-labelledby"))
        .textContent,
      "Details",
    );
    assert.equal(dialog.querySelector("form").getAttribute("method"), "dialog");
    assert.equal(dialog.querySelector("button").type, "submit");
  } finally {
    await act(() => root.unmount());
  }
});

test("page selection regenerates output and preserves the loaded document", async () => {
  const app = await mountConversion();
  try {
    const doc = await pdfLib.PDFDocument.create();
    doc.addPage([100, 200]);
    doc.addPage([300, 400]);
    await act(async () =>
      app.value.selectFiles([new File([await doc.save()], "pages.pdf")]),
    );
    await act(() => app.value.selectPage(2));
    assert.equal(app.value.source.pageNumber, 2);
    assert.equal(app.value.source.width, 300);
    assert.equal(app.value.output.filename, "pages_page2_4up.pdf");
    assert.equal(app.worker.loads, 1);
    await act(() => app.value.selectPage(3));
    assert.equal(app.value.status.title, "Page selection failed");
    assert.equal(app.value.output, null);
    await act(() => app.value.selectPage(1));
    assert.equal(app.value.source.pageNumber, 1);
    assert.equal(app.value.status.title, "Output ready");
  } finally {
    await app.close();
  }
});

test("reset clears remembered settings and optional sizing choices", async () => {
  const app = await mountConversion();
  try {
    await act(() => app.value.setRememberSettings(true));
    await act(() =>
      app.value.changeOptions({
        scaleMode: "percent",
        scalePercent: 25,
        cropMarks: true,
      }),
    );
    assert.ok(localStorage.getItem("pdf-nup.preferences.v1"));
    await act(() => app.value.resetSettings());
    assert.equal(app.value.options.scaleMode, "fit");
    assert.equal(app.value.options.cropMarks, false);
    assert.equal(app.value.rememberSettings, false);
    assert.equal(localStorage.getItem("pdf-nup.preferences.v1"), null);
  } finally {
    await app.close();
  }
});

test("batch hook produces a ZIP, invalidates changed pages and clears retained results", async () => {
  const previousWorker = globalThis.Worker;
  globalThis.Worker = class {
    constructor(url) {
      this.archive = url.pathname.includes("archive-worker");
      this.engine = createConversionEngine(pdfLib);
    }
    postMessage(data) {
      Promise.resolve().then(async () => {
        if (this.archive) {
          this.onmessage({ data: { bytes: createArchive(data) } });
          return;
        }
        try {
          const result =
            data.method === "load"
              ? await this.engine.load(
                  data.payload.bytes,
                  data.payload.metadata,
                )
              : data.method === "selectPage"
                ? this.engine.selectPage(data.payload)
                : await this.engine.generate(data.payload);
          this.onmessage({ data: { id: data.id, result } });
        } catch (error) {
          this.onmessage({ data: { id: data.id, error: error.message } });
        }
      });
    }
    terminate() {}
  };
  let value, root;
  function Harness() {
    value = useBatch();
    return null;
  }
  await act(() => {
    root = create(createElement(Harness));
  });
  try {
    await act(async () =>
      value.selectFiles([await file(), new File(["bad"], "bad.pdf")]),
    );
    await act(() => value.run({ layout: LAYOUTS[4], paperMode: "a4" }));
    assert.equal(value.processing, false);
    assert.equal(value.entries[0].status, "ready");
    assert.equal(value.entries[1].status, "failed");
    assert.equal(value.archive.type, "application/zip");
    assert.match(value.message, /1 of 2/);
    await act(() => value.setPage(0, 2));
    assert.equal(value.archive, null);
    assert.equal(value.entries[0].output, undefined);
    await act(() => value.clear());
    assert.equal(value.entries.length, 0);
    assert.equal(value.archive, null);
  } finally {
    await act(() => root.unmount());
    if (previousWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = previousWorker;
  }
});

test("batch hook cancellation prevents stale work from repopulating cleared results", async () => {
  const previousWorker = globalThis.Worker;
  let terminated = false;
  globalThis.Worker = class {
    postMessage() {}
    terminate() {
      terminated = true;
    }
  };
  let value, root;
  function Harness() {
    value = useBatch();
    return null;
  }
  await act(() => {
    root = create(createElement(Harness));
  });
  try {
    await act(async () => value.selectFiles([await file()]));
    let running;
    await act(async () => {
      running = value.run({ layout: LAYOUTS[4], paperMode: "expand" });
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    assert.equal(value.processing, true);
    await act(async () => {
      value.clear();
      await running;
    });
    assert.equal(value.processing, false);
    assert.equal(value.entries.length, 0);
    assert.equal(value.archive, null);
    assert.equal(terminated, true);
  } finally {
    await act(() => root.unmount());
    if (previousWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = previousWorker;
  }
});

test("multiple file drops queue a batch through the app", async () => {
  let root;
  await act(() => {
    root = create(createElement(App));
  });
  try {
    const files = [await file(), await file()];
    const event = new window.Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { types: ["Files"], files },
    });
    await act(async () => window.dispatchEvent(event));
    const panel = root.container.querySelector(
      '[aria-label="Batch conversion"]',
    );
    assert.equal(panel.querySelectorAll("li").length, 2);
    assert.ok(panel.textContent.includes("Convert batch"));
    assert.equal(
      root.container
        .querySelector('[role="status"]')
        .textContent.includes("Multiple files rejected"),
      false,
    );
  } finally {
    await act(() => root.unmount());
    window.history.replaceState(null, "", "/");
  }
});

test("exact dimensions stay linked across edits and source changes", async () => {
  const app = await mountConversion();
  try {
    await act(async () => app.value.selectFiles([await file(100, 200)]));
    await act(() =>
      app.value.changeOptions({ scaleMode: "dimensions", copyWidthMm: 30 }),
    );
    assert.equal(app.value.options.copyHeightMm, 60);
    assert.equal(app.value.failed, false);
    await act(() => app.value.changeOptions({ copyHeightMm: 80 }));
    assert.equal(app.value.options.copyWidthMm, 40);
    await act(async () => app.value.selectFiles([await file(200, 100)]));
    assert.equal(app.value.options.copyWidthMm, 40);
    assert.equal(app.value.options.copyHeightMm, 20);
    assert.equal(app.value.failed, false);
  } finally {
    await app.close();
  }
});
