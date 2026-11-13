import "./dom.js";
import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { BatchPanel } from "../src/BatchPanel.tsx";
import { DEFAULT_OPTIONS } from "../src/preferences.ts";
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

function stubWorkers(
  generate,
  archive = () => new Uint8Array([1, 2, 3]),
  load = () => ({ warnings: [] }),
) {
  const previous = globalThis.Worker;
  globalThis.Worker = class {
    constructor(url) {
      this.archive = url.pathname.includes("archive-worker");
    }
    postMessage(request) {
      Promise.resolve().then(async () => {
        try {
          if (this.archive) {
            const bytes = await archive(request);
            if (!this.terminated) this.onmessage({ data: { bytes } });
            return;
          }
          if (request.method === "load")
            this.filename = request.payload.metadata.name;
          const result =
            request.method === "generate"
              ? await generate(request.payload, this)
              : request.method === "load"
                ? await load(request.payload)
                : { warnings: [] };
          if (!this.terminated)
            this.onmessage({ data: { id: request.id, result } });
        } catch (error) {
          if (!this.terminated)
            this.onmessage({ data: { id: request.id, error: error.message } });
        }
      });
    }
    terminate() {
      this.terminated = true;
    }
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
  const restore = stubWorkers(output);
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
    await act(async () => {
      replacement.dispatchEvent(new window.Event("change", { bubbles: true }));
      await new Promise((resolve) => setImmediate(resolve));
    });
    assert.equal(app.value.entries[0].file.name, "new.pdf");
    await act(() =>
      app.container.querySelector('[aria-label="Remove second.pdf"]').click(),
    );
    assert.equal(app.value.entries.length, 1);
    assert.equal(app.value.entries[0].file.name, "new.pdf");
    assert.equal(
      document.activeElement.getAttribute("aria-label"),
      "Remove new.pdf",
    );
  } finally {
    await app.close();
    restore();
  }
});

test("malformed replacement preserves a completed row and its archive", async () => {
  const restore = stubWorkers(output, undefined, (payload) => {
    if (payload.metadata.name === "broken.pdf")
      throw new Error("Malformed PDF structure");
    return { warnings: [] };
  });
  const app = await mountBatch();
  try {
    await act(() => app.value.selectFiles([pdf("original.pdf")]));
    await act(() => app.value.run(options));
    const original = app.value.entries[0];
    const archive = app.value.archive;
    await act(async () => {
      assert.equal(
        await app.value.replaceFile(original.id, pdf("broken.pdf")),
        false,
      );
    });
    assert.equal(app.value.entries[0].file, original.file);
    assert.equal(app.value.entries[0].output, original.output);
    assert.equal(app.value.archive, archive);
    assert.match(
      app.value.entries[0].replacementError,
      /Malformed PDF structure/,
    );
  } finally {
    await app.close();
    restore();
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
    await act(async () =>
      assert.equal(
        await app.value.replaceFile(0, pdf("replacement.pdf")),
        true,
      ),
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
    await act(async () =>
      assert.equal(
        await app.value.replaceFile(0, new File([], "empty.pdf")),
        false,
      ),
    );
    assert.equal(app.value.entries[0].file, original);
    assert.equal(app.value.entries[0].pageNumber, 7);
    assert.match(app.value.entries[0].replacementError, /empty/);
    await act(async () =>
      assert.equal(
        await app.value.replaceFile(0, sized("too-large.pdf", 50_000_000)),
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

test("selective retry reuses matching successes and normalises omitted default settings", async () => {
  const calls = [];
  let fail = true;
  const restore = stubWorkers((_settings, worker) => {
    calls.push(worker.filename);
    if (worker.filename === "second.pdf" && fail) throw new Error("Try again");
    return { ...output(), filename: worker.filename };
  });
  const app = await mountBatch();
  try {
    await act(() =>
      app.value.selectFiles([
        pdf("first.pdf"),
        pdf("second.pdf"),
        pdf("third.pdf"),
      ]),
    );
    await act(() => app.value.run(options));
    const third = app.value.entries[2].output;
    assert.equal(app.value.isStale({ ...DEFAULT_OPTIONS, ...options }), false);
    await act(() => app.value.remove(0));
    fail = false;
    await act(() => app.value.run({ ...DEFAULT_OPTIONS, ...options }, 1));
    assert.deepEqual(calls, [
      "first.pdf",
      "second.pdf",
      "third.pdf",
      "second.pdf",
    ]);
    assert.deepEqual(
      app.value.entries.map((entry) => entry.id),
      [1, 2],
    );
    assert.equal(app.value.entries[1].output, third);
    assert.ok(app.value.archive);
    const existingArchive = app.value.archive;
    await act(() => app.value.run(options));
    assert.equal(calls.length, 4);
    assert.equal(app.value.archive, existingArchive);
  } finally {
    await app.close();
    restore();
  }
});

test("ZIP failure retries independently and keeps completed PDF results", async () => {
  let conversions = 0,
    archives = 0;
  const restore = stubWorkers(
    () => {
      conversions++;
      return output();
    },
    () => {
      archives++;
      if (archives === 1) throw new Error("ZIP worker failed");
      return new Uint8Array([1, 2, 3]);
    },
  );
  const app = await mountBatch(true);
  try {
    await act(() => app.value.selectFiles([pdf()]));
    await act(() => app.value.run(options));
    const ready = app.value.entries[0].output;
    assert.ok(ready);
    assert.equal(app.value.archive, null);
    assert.equal(app.value.archiveError, "ZIP worker failed");
    assert.equal(app.value.canRebuildArchive(options), true);
    const retry = [...app.container.querySelectorAll("button")].find(
      (button) => button.textContent === "Retry ZIP",
    );
    assert.ok(retry);
    await act(() => app.value.rebuildArchive(options));
    assert.equal(conversions, 1);
    assert.equal(archives, 2);
    assert.equal(app.value.entries[0].output, ready);
    assert.ok(app.value.archive);
    assert.equal(app.value.archiveError, "");
  } finally {
    await app.close();
    restore();
  }
});

test("cancelled batches retain matching results and resume unfinished files only", async () => {
  const calls = [];
  let release;
  let pause = true;
  const restore = stubWorkers((_settings, worker) => {
    calls.push(worker.filename);
    if (worker.filename === "second.pdf" && pause)
      return new Promise((resolve) => {
        release = () => resolve(output());
      });
    return output();
  });
  const app = await mountBatch();
  try {
    await act(() =>
      app.value.selectFiles([
        pdf("first.pdf"),
        pdf("second.pdf"),
        pdf("third.pdf"),
      ]),
    );
    let running;
    await act(async () => {
      running = app.value.run(options);
      for (let attempt = 0; attempt < 100 && !release; attempt++)
        await new Promise((resolve) => setImmediate(resolve));
    });
    assert.ok(release);
    const first = app.value.entries[0].output;
    await act(async () => {
      app.value.cancel();
      await running;
      release();
    });
    assert.equal(app.value.entries[0].output, first);
    assert.deepEqual(
      app.value.entries.map((entry) => entry.status),
      ["ready", "cancelled", "cancelled"],
    );
    pause = false;
    await act(() => app.value.run(options));
    assert.deepEqual(calls, [
      "first.pdf",
      "second.pdf",
      "second.pdf",
      "third.pdf",
    ]);
    assert.equal(app.value.entries[0].output, first);
    assert.ok(app.value.archive);
  } finally {
    await app.close();
    restore();
  }
});

test("different settings cannot be mixed in ZIP and full conversion repairs only stale outputs", async () => {
  let fail = true,
    archives = 0;
  const calls = [];
  const restore = stubWorkers(
    (settings, worker) => {
      calls.push([worker.filename, settings.paperMode]);
      if (worker.filename === "second.pdf" && fail)
        throw new Error("Try again");
      return output();
    },
    () => {
      archives++;
      return new Uint8Array([1]);
    },
  );
  const app = await mountBatch();
  try {
    await act(() =>
      app.value.selectFiles([pdf("first.pdf"), pdf("second.pdf")]),
    );
    await act(() => app.value.run(options));
    fail = false;
    const changed = { ...options, paperMode: "a3" };
    await act(() => app.value.run(changed, 1));
    assert.equal(app.value.archive, null);
    assert.equal(app.value.canRebuildArchive(changed), false);
    assert.equal(app.value.isStale(changed), true);
    assert.match(app.value.message, /different settings/);
    await act(() => app.value.rebuildArchive(changed));
    assert.equal(archives, 1);
    const second = app.value.entries[1].output;
    await act(() => app.value.run(changed));
    assert.deepEqual(calls, [
      ["first.pdf", "a4"],
      ["second.pdf", "a4"],
      ["second.pdf", "a3"],
      ["first.pdf", "a3"],
    ]);
    assert.equal(app.value.entries[1].output, second);
    assert.equal(app.value.isStale(changed), false);
    assert.ok(app.value.archive);
  } finally {
    await app.close();
    restore();
  }
});

test("retry output budget includes retained successful PDFs", async () => {
  let first = true;
  const restore = stubWorkers((_settings, worker) => {
    if (worker.filename === "second.pdf" && first) throw new Error("Try again");
    return {
      ...output(),
      bytes: { byteLength: 60_000_000, slice: () => new Uint8Array([1]) },
    };
  });
  const app = await mountBatch();
  try {
    await act(() =>
      app.value.selectFiles([pdf("first.pdf"), pdf("second.pdf")]),
    );
    await act(() => app.value.run(options));
    first = false;
    const retained = app.value.entries[0].output;
    await act(() => app.value.run(options));
    assert.equal(app.value.entries[0].output, retained);
    assert.equal(app.value.entries[1].output, undefined);
    assert.equal(app.value.entries[1].status, "failed");
    assert.match(app.value.entries[1].error, /100 MB/);
  } finally {
    await app.close();
    restore();
  }
});

test("cancelling ZIP preparation retains PDFs and rebuilds without converting again", async () => {
  let conversions = 0,
    archives = 0,
    release;
  const restore = stubWorkers(
    () => {
      conversions++;
      return output();
    },
    () => {
      archives++;
      if (archives === 1)
        return new Promise((resolve) => {
          release = () => resolve(new Uint8Array([1]));
        });
      return new Uint8Array([2]);
    },
  );
  const app = await mountBatch();
  try {
    await act(() => app.value.selectFiles([pdf()]));
    let running;
    await act(async () => {
      running = app.value.run(options);
      for (let attempt = 0; attempt < 100 && !release; attempt++)
        await new Promise((resolve) => setImmediate(resolve));
    });
    assert.ok(release);
    const result = app.value.entries[0].output;
    await act(async () => {
      app.value.cancel();
      await running;
      release();
    });
    assert.equal(app.value.archive, null);
    assert.equal(app.value.entries[0].status, "ready");
    assert.equal(app.value.canRebuildArchive(options), true);
    await act(() => app.value.rebuildArchive(options));
    assert.equal(conversions, 1);
    assert.equal(archives, 2);
    assert.equal(app.value.entries[0].output, result);
    assert.ok(app.value.archive);
  } finally {
    await app.close();
    restore();
  }
});
