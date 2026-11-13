import "./dom.js";
import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { BatchPanel } from "../src/BatchPanel.tsx";
import { useBatch } from "../src/useBatch.ts";

const options = { layout: { copies: 4, columns: 2, rows: 2 }, paperMode: "a4" };
const pdf = (name = "test.pdf") => new File(["%PDF-1.7\n"], name);

async function mountBatch(renderPanel = false) {
  let value;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  function Harness() {
    value = useBatch();
    return renderPanel
      ? createElement(BatchPanel, { batch: value, options, disabled: false })
      : null;
  }
  await act(() => root.render(createElement(Harness)));
  return {
    container,
    get value() {
      return value;
    },
    close: () =>
      act(() => {
        root.unmount();
        container.remove();
      }),
  };
}

function stubWorkers(generate) {
  const previous = globalThis.Worker;
  globalThis.Worker = class {
    constructor(url) {
      this.archive = url.pathname.includes("archive-worker");
    }
    postMessage(request) {
      Promise.resolve().then(async () => {
        if (this.archive) {
          this.onmessage({ data: { bytes: new Uint8Array([1, 2, 3]) } });
          return;
        }
        const result =
          request.method === "generate"
            ? await generate(request.payload)
            : { warnings: [] };
        this.onmessage({ data: { id: request.id, result } });
      });
    }
    terminate() {}
  };
  return () => {
    if (previous === undefined) delete globalThis.Worker;
    else globalThis.Worker = previous;
  };
}

const output = () => ({
  bytes: new Uint8Array([1]),
  filename: "result.pdf",
  warnings: [],
  sheets: [],
});

test("batch panel labels row actions with filenames and replaces through its file input", async () => {
  const app = await mountBatch(true);
  try {
    await act(() =>
      app.value.selectFiles([pdf("first.pdf"), pdf("second.pdf")]),
    );
    const buttons = () => [...app.container.querySelectorAll("button")];
    assert.ok(
      buttons().some((button) => button.textContent === "Replace batch files"),
    );
    await act(() =>
      app.container.querySelector('[aria-label="Replace first.pdf"]').click(),
    );
    const replacement = app.container.querySelectorAll('input[type="file"]')[1];
    Object.defineProperty(replacement, "files", {
      value: [pdf("new.pdf")],
      configurable: true,
    });
    await act(() =>
      replacement.dispatchEvent(new window.Event("change", { bubbles: true })),
    );
    assert.equal(app.value.entries[0].file.name, "new.pdf");
    await act(() =>
      app.container.querySelector('[aria-label="Remove second.pdf"]').click(),
    );
    assert.equal(app.value.entries.length, 1);
    assert.equal(app.value.entries[0].file.name, "new.pdf");
  } finally {
    await app.close();
  }
});

test("batch intake flags cheap file errors and rejects oversized batches transactionally", async () => {
  const app = await mountBatch();
  try {
    const oversized = pdf("large.pdf");
    Object.defineProperty(oversized, "size", { value: 50_000_001 });
    await act(() =>
      app.value.selectFiles([
        pdf(),
        new File([], "empty.pdf"),
        pdf("wrong.txt"),
        oversized,
      ]),
    );
    assert.deepEqual(
      app.value.entries.map((entry) => entry.status),
      ["queued", "failed", "failed", "failed"],
    );
    assert.match(app.value.entries[1].error, /empty/);
    assert.match(app.value.entries[2].error, /extension/);
    assert.match(app.value.entries[3].error, /limit/);
    const entries = app.value.entries;
    await act(() =>
      assert.equal(
        app.value.selectFiles(Array.from({ length: 21 }, () => pdf())),
        false,
      ),
    );
    assert.equal(app.value.entries, entries);
  } finally {
    await app.close();
  }
});

test("batch runs snapshot settings, count completion and preserve results for unchanged pages", async () => {
  let release;
  let received;
  const restore = stubWorkers((settings) => {
    received = settings;
    return new Promise((resolve) => {
      release = () => resolve(output());
    });
  });
  const app = await mountBatch();
  try {
    await act(() => app.value.selectFiles([pdf()]));
    let running;
    const settings = structuredClone(options);
    await act(async () => {
      running = app.value.run(settings);
      await new Promise((resolve) => setImmediate(resolve));
    });
    assert.match(app.value.message, /0 of 1/);
    settings.layout.copies = 8;
    assert.equal(received.layout.copies, 4);
    await act(async () => {
      release();
      await running;
    });
    assert.match(app.value.message, /1 of 1/);
    assert.equal(app.value.isStale(options), false);
    assert.equal(app.value.isStale(settings), true);
    const archive = app.value.archive;
    const entries = app.value.entries;
    const message = app.value.message;
    await act(() => app.value.setPage(0, 1));
    assert.equal(app.value.archive, archive);
    assert.equal(app.value.entries, entries);
    assert.equal(app.value.message, message);
  } finally {
    await app.close();
    restore();
  }
});

test("batch saves report the chosen filename and neutral cancellation without discarding results", async () => {
  const restore = stubWorkers(output);
  const app = await mountBatch();
  try {
    await act(() => app.value.selectFiles([pdf()]));
    await act(() => app.value.run(options));
    const archive = app.value.archive;
    window.showSaveFilePicker = async () => ({
      name: "chosen.zip",
      createWritable: async () => ({
        write: async () => {},
        close: async () => {},
      }),
    });
    await act(() => app.value.save());
    assert.equal(app.value.message, "Saved chosen.zip.");
    window.showSaveFilePicker = async () => {
      throw new DOMException("Cancelled", "AbortError");
    };
    await act(() => app.value.save(0));
    assert.match(app.value.message, /Save cancelled/);
    assert.equal(app.value.archive, archive);
    assert.ok(app.value.entries[0].output);
  } finally {
    delete window.showSaveFilePicker;
    await app.close();
    restore();
  }
});

test("removing and replacing rows preserves other results and stable identities", async () => {
  const restore = stubWorkers(output);
  const app = await mountBatch();
  try {
    await act(() =>
      app.value.selectFiles([
        pdf("first.pdf"),
        pdf("second.pdf"),
        pdf("third.pdf"),
      ]),
    );
    await act(() => app.value.setPage(2, 3));
    await act(() => app.value.run(options));
    const third = app.value.entries[2];
    const firstOutput = app.value.entries[0].output;
    await act(() => app.value.remove(1));
    assert.equal(app.value.archive, null);
    assert.deepEqual(
      app.value.entries.map((entry) => entry.id),
      [0, 2],
    );
    assert.equal(app.value.entries[1], third);
    await act(() =>
      assert.equal(app.value.replaceFile(0, pdf("replacement.pdf")), true),
    );
    assert.equal(app.value.entries[0].id, 0);
    assert.equal(app.value.entries[0].output, undefined);
    assert.equal(app.value.entries[0].status, "queued");
    assert.equal(app.value.entries[1], third);
    assert.ok(firstOutput);
    await act(() => app.value.run(options));
    assert.ok(app.value.entries.every((entry) => entry.output));
    await act(() => app.value.selectFiles([pdf("new.pdf")]));
    assert.equal(app.value.entries[0].id, 3);
  } finally {
    await app.close();
    restore();
  }
});

test("replacement rejects invalid and over-budget files without discarding the selected row", async () => {
  const app = await mountBatch();
  const sized = (name, size) => {
    const file = pdf(name);
    Object.defineProperty(file, "size", { value: size });
    return file;
  };
  try {
    await act(() =>
      app.value.selectFiles([
        sized("first.pdf", 40_000_000),
        sized("second.pdf", 40_000_000),
        sized("third.pdf", 20_000_000),
      ]),
    );
    await act(() => app.value.setPage(0, 7));
    const original = app.value.entries[0].file;
    const other = app.value.entries[1];
    await act(() =>
      assert.equal(app.value.replaceFile(0, new File([], "empty.pdf")), false),
    );
    assert.equal(app.value.entries[0].file, original);
    assert.equal(app.value.entries[0].pageNumber, 7);
    assert.match(app.value.entries[0].replacementError, /empty/);
    await act(() =>
      assert.equal(
        app.value.replaceFile(0, sized("too-large.pdf", 50_000_000)),
        false,
      ),
    );
    assert.equal(app.value.entries[0].file, original);
    assert.equal(app.value.entries[1], other);
    assert.match(app.value.entries[0].replacementError, /100 MB/);
  } finally {
    await app.close();
  }
});
