import assert from "node:assert/strict";
import test from "node:test";
import * as pdfLib from "pdf-lib";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import App from "../src/App.tsx";
import { createConversionEngine } from "../src/conversion.ts";
import { LAYOUTS } from "../src/geometry.ts";
import { Preview } from "../src/Preview.tsx";
import { useConversion } from "../src/useConversion.ts";
import { WorkerLostError } from "../src/worker-client.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const listeners = new Map();
globalThis.window = {
  location: { hash: "" },
  matchMedia: () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }),
  addEventListener: (name, callback) => listeners.set(name, callback),
  removeEventListener: (name) => listeners.delete(name),
  scrollTo() {},
};
globalThis.localStorage = { removeItem() {} };

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
    await act(() => listeners.get("pagehide")({ persisted: true }));
    assert.ok(app.value.output);
    await act(() => listeners.get("pagehide")({ persisted: false }));
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
    await act(() => app.value.openOutput(true));
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
    await act(() => app.value.openOutput(true));
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
    await act(() => app.value.openOutput(true));
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
    await act(() => app.value.openOutput(true));
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
    await act(() => app.value.openOutput(false));
    assert.equal(anchors[1].href, app.value.output.url);
    assert.equal(app.value.output.blob.type, "application/pdf");
    assert.equal(anchors[1].target, "_blank");
    assert.equal(anchors[1].download, undefined);
  } finally {
    globalThis.document = previousDocument;
    await app.close();
  }
});

test("native PDF preview follows regenerated output and clears without retaining a frame", async () => {
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
    assert.equal(root.root.findAllByType("iframe").length, 0);
    await act(async () => app.value.selectFiles([await file()]));
    await act(() => root.update(render()));
    const firstUrl = app.value.output.url;
    assert.equal(
      root.root.findByType("iframe").props.src,
      `${firstUrl}#filename=handout_4up.pdf&zoom=page-fit`,
    );
    assert.equal(root.root.findAllByType("canvas").length, 0);
    await act(() => root.update(render(false)));
    assert.equal(root.root.findAllByType("iframe").length, 0);
    await act(() => root.update(render()));
    assert.equal(root.root.findAllByType("iframe").length, 1);
    await act(() => app.value.changeOptions({ layout: LAYOUTS[8] }));
    await act(() => root.update(render()));
    assert.equal(
      root.root.findByType("iframe").props.src,
      `${app.value.output.url}#filename=handout_8up.pdf&zoom=page-fit`,
    );
    await assert.rejects(fetch(firstUrl));
    await act(() => app.value.clearDocument());
    await act(() => root.update(render()));
    assert.equal(root.root.findAllByType("iframe").length, 0);
  } finally {
    if (root) await act(() => root.unmount());
    await app.close();
  }
});

test("the empty state has no inactive preview or download controls", async (t) => {
  t.mock.getter(globalThis, "navigator", () => ({ pdfViewerEnabled: true }));
  let root;
  await act(() => {
    root = create(createElement(App));
  });
  try {
    assert.equal(
      root.root.findAllByProps({ id: "downloadOutputButton" }).length,
      0,
    );
    assert.equal(root.root.findAllByProps({ id: "downloadHelp" }).length, 0);
    assert.equal(root.root.findAllByType(Preview).length, 0);
    assert.equal(root.root.findAllByProps({ id: "statusBox" }).length, 0);
  } finally {
    await act(() => root.unmount());
  }
});

test("footer navigation preserves conversion options without a sidebar", async () => {
  let root;
  await act(() => {
    root = create(createElement(App));
  });
  try {
    const byId = (id) => root.root.findByProps({ id });
    assert.equal(
      root.root.findByProps({ name: "layout", value: "4" }).props.checked,
      true,
    );
    assert.equal(
      root.root.findByProps({ name: "paperMode", value: "expand" }).props
        .checked,
      true,
    );
    assert.equal(
      root.root.findAllByProps({ id: "openOutputButton" }).length,
      0,
    );
    assert.equal(root.root.findAllByProps({ id: "sidebar" }).length, 0);
    assert.equal(
      root.root.findAllByProps({ id: "mobileMenuButton" }).length,
      0,
    );
    const follow = async (view) => {
      window.location.hash = root.root.findByType("footer").findByProps({
        "data-view": view,
      }).props.href;
      await act(() => listeners.get("hashchange")());
    };
    await follow("privacy");
    assert.equal(byId("view-privacy").props.hidden, false);
    assert.equal(byId("view-convert").props.hidden, true);
    assert.equal(byId("pageTitle").children.join(""), "Privacy");
    await follow("guide");
    assert.equal(byId("pageTitle").children.join(""), "How it works");
    await follow("convert");
    assert.equal(byId("view-convert").props.hidden, false);
  } finally {
    window.location.hash = "";
    await act(() => root.unmount());
  }
});

test("viewport drops validate files and keep the overlay stable across child elements", async () => {
  let root;
  await act(() => {
    root = create(createElement(App));
  });
  const drag = (types = ["Files"], files = []) => ({
    dataTransfer: { types, files },
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {},
  });
  const overlay = () => root.root.findAllByProps({ id: "dropOverlay" });
  try {
    await act(() => listeners.get("dragenter")(drag(["text/plain"])));
    assert.equal(overlay().length, 0);
    await act(() => listeners.get("dragenter")(drag()));
    await act(() => listeners.get("dragenter")(drag()));
    await act(() => listeners.get("dragleave")(drag()));
    assert.equal(overlay().length, 1);
    const over = drag();
    await act(() => listeners.get("dragover")(over));
    assert.equal(over.prevented, true);
    assert.equal(over.dataTransfer.dropEffect, "copy");
    const drop = drag(["Files"], [new File(["not a PDF"], "wrong.pdf")]);
    await act(() => listeners.get("drop")(drop));
    assert.equal(drop.prevented, true);
    assert.equal(overlay().length, 0);
    assert.equal(
      root.root.findByProps({ id: "statusTitle" }).children.join(""),
      "File rejected",
    );
    await act(() => listeners.get("dragenter")(drag()));
    await act(() => listeners.get("blur")());
    assert.equal(overlay().length, 0);
  } finally {
    window.location.hash = "";
    await act(() => root.unmount());
    assert.equal(listeners.has("drop"), false);
  }
});

test("dropping anywhere converts once, replaces the PDF and returns from help", async (t) => {
  t.mock.getter(globalThis, "navigator", () => ({ pdfViewerEnabled: true }));
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
  window.location.hash = "#view-privacy";
  await act(() => {
    root = create(createElement(App));
  });
  const drop = (input) =>
    listeners.get("drop")({
      dataTransfer: { files: [input] },
      preventDefault() {},
      stopPropagation() {},
    });
  try {
    await act(async () => drop(await file()));
    assert.equal(
      root.root.findByProps({ id: "view-convert" }).props.hidden,
      false,
    );
    assert.equal(
      root.root.findByProps({ id: "dropTitle" }).children.join(""),
      "handout.pdf",
    );
    assert.equal(
      root.root.findByProps({ id: "selectFileButton" }).children.join(""),
      "Replace PDF",
    );
    assert.equal(workers.length, 1);
    assert.equal(workers[0].engine.loads, 1);
    const first = root.root.findByType(Preview).props.output;
    assert.equal(root.root.findByType(Preview).props.nativeViewer, true);
    assert.equal(
      root.root.findAllByProps({ id: "downloadOutputButton" }).length,
      1,
    );
    const replacement = new File(
      [await (await file()).arrayBuffer()],
      "replacement.pdf",
    );
    await act(() => drop(replacement));
    assert.equal(workers.length, 2);
    assert.equal(workers[1].engine.loads, 1);
    assert.equal(
      root.root.findByType(Preview).props.output.filename,
      "replacement_4up.pdf",
    );
    await assert.rejects(fetch(first.url));
  } finally {
    window.location.hash = "";
    await act(() => root.unmount());
    if (previousWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = previousWorker;
  }
});
