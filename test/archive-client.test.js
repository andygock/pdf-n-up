import assert from "node:assert/strict";
import test from "node:test";
import { Worker as NodeWorker } from "node:worker_threads";
import { unzipSync } from "fflate";
import { createArchiveInWorker } from "../src/archive-client.ts";

test("archive worker transfers a valid ZIP without detaching retained results", {
  timeout: 10000,
}, async () => {
  const previous = globalThis.Worker;
  let terminated = false;
  globalThis.Worker = class {
    constructor(url) {
      this.thread = new NodeWorker(
        new URL(
          "data:text/javascript," +
            encodeURIComponent(`
        import {parentPort,workerData} from 'node:worker_threads';
        globalThis.self = globalThis;
        globalThis.postMessage = (data,transfer) => parentPort.postMessage(data,transfer);
        import(workerData).then(() => parentPort.on('message',data => self.onmessage({data})));
      `),
        ),
        { workerData: url.href },
      );
      this.thread.on("message", (data) => this.onmessage({ data }));
      this.thread.on("error", (error) => this.onerror(error));
    }
    postMessage(data, transfer) {
      this.thread.postMessage(data, transfer);
    }
    terminate() {
      terminated = true;
      void this.thread.terminate();
    }
  };
  try {
    const bytes = new TextEncoder().encode("%PDF-example");
    const blob = await createArchiveInWorker(
      [{ filename: "test.pdf", bytes }],
      new AbortController().signal,
    );
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    assert.deepEqual(entries["001_test.pdf"], bytes);
    assert.equal(bytes.byteLength, 12);
    assert.equal(blob.type, "application/zip");
    assert.equal(terminated, true);
  } finally {
    if (previous === undefined) delete globalThis.Worker;
    else globalThis.Worker = previous;
  }
});

test("cancelling archive creation terminates its worker", async () => {
  const previous = globalThis.Worker;
  let terminated = false;
  globalThis.Worker = class {
    postMessage() {}
    terminate() {
      terminated = true;
    }
  };
  try {
    const controller = new AbortController();
    const pending = createArchiveInWorker(
      [{ filename: "a.pdf", bytes: new Uint8Array([1]) }],
      controller.signal,
    );
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(terminated, true);
  } finally {
    if (previous === undefined) delete globalThis.Worker;
    else globalThis.Worker = previous;
  }
});
