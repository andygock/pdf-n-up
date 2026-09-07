import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { ConversionWorkerClient } from "../js/worker-client.js";
import { withDeadline } from "../js/async.js";
import { PDFDocument } from "pdf-lib";
import { LAYOUTS } from "../js/geometry.js";

const fakeWorker = () => ({
  terminated: false,
  postMessage(message) {
    this.lastMessage = message;
  },
  terminate() {
    this.terminated = true;
  },
  reply(result) {
    this.onmessage({ data: { id: this.lastMessage.id, result } });
  },
});

test("cancellation rejects the request, terminates its worker and allows a fresh source", async () => {
  const workers = [];
  const client = new ConversionWorkerClient(() => {
    const worker = fakeWorker();
    workers.push(worker);
    return worker;
  });
  const first = client.request("load", {});
  const rejected = assert.rejects(first, (error) => error.workerLost === true);
  client.dispose();
  await rejected;
  assert.equal(workers[0].terminated, true);
  const second = client.request("load", {});
  workers[0].reply("stale");
  workers[1].reply("new");
  assert.equal(await second, "new");
  client.dispose();
});

test("ordinary conversion errors keep the source worker available", async () => {
  const worker = fakeWorker();
  const client = new ConversionWorkerClient(() => worker);
  const loaded = client.request("load", {});
  worker.reply("source");
  await loaded;
  const bad = client.request("generate", {});
  worker.onmessage({
    data: { id: worker.lastMessage.id, error: "Output too large" },
  });
  await assert.rejects(bad, /too large/);
  assert.equal(worker.terminated, false);
  const good = client.request("generate", {});
  worker.reply("recovered");
  assert.equal(await good, "recovered");
  client.dispose();
});

test("worker crash invalidates the retained source, including idle crashes", async () => {
  const worker = fakeWorker();
  const client = new ConversionWorkerClient(() => worker);
  const loaded = client.request("load", {});
  worker.reply("source");
  await loaded;
  worker.onerror();
  await assert.rejects(
    client.request("generate", {}),
    (error) => error.workerLost === true,
  );
});

test(
  "watchdog terminates a real worker stuck in CPU-bound work",
  { timeout: 5000 },
  async () => {
    let thread;
    let exited;
    const client = new ConversionWorkerClient(() => {
      thread = new Worker("while (true) {}", { eval: true });
      exited = new Promise((resolve) => thread.once("exit", resolve));
      return { postMessage() {}, terminate: () => thread.terminate() };
    }, 100);
    try {
      await assert.rejects(client.request("load", {}), /exceeded/);
      await exited;
      assert.equal(client.worker, null);
    } finally {
      client.dispose();
    }
  },
);

test("deadlines and cancellation settle even when the underlying operation never does", async () => {
  await assert.rejects(
    withDeadline(new Promise(() => {}), null, 10, "Timed out"),
    /Timed out/,
  );
  const controller = new AbortController();
  const cancelled = withDeadline(
    new Promise(() => {}),
    controller.signal,
    1000,
    "Timed out",
  );
  controller.abort();
  await assert.rejects(cancelled, { name: "AbortError" });
  assert.equal(
    await withDeadline(Promise.resolve(42), null, 1000, "Timed out"),
    42,
  );
});

test(
  "the shipped browser worker loads its vendored library and transfers a PDF",
  { timeout: 10_000 },
  async () => {
    const client = new ConversionWorkerClient(() => {
      // Adapt Node's transport only; execute the actual browser worker module,
      // including its UMD library import and request dispatch implementation.
      const thread = new Worker(
        new URL(
          "data:text/javascript," +
            encodeURIComponent(`
      import { parentPort, workerData } from 'node:worker_threads';
      globalThis.self = globalThis;
      globalThis.postMessage = (data, transfer) => parentPort.postMessage(data, transfer);
      import(workerData).then(() => parentPort.on('message', data => self.onmessage({ data })));
    `),
        ),
        {
          workerData: new URL("../js/conversion-worker.js", import.meta.url)
            .href,
        },
      );
      const adapter = {
        postMessage: (data, transfer) => thread.postMessage(data, transfer),
        terminate: () => thread.terminate(),
      };
      thread.on("message", (data) => adapter.onmessage({ data }));
      thread.on("error", () => adapter.onerror());
      return adapter;
    });
    try {
      const doc = await PDFDocument.create();
      doc.addPage([100, 200]);
      const bytes = await doc.save();
      const loaded = await client.request(
        "load",
        { bytes, metadata: { name: "worker.pdf", size: bytes.length } },
        [bytes.buffer],
      );
      assert.equal(bytes.byteLength, 0);
      assert.equal(loaded.width, 100);
      const result = await client.request("generate", {
        layout: LAYOUTS[4],
        paperMode: "expand",
      });
      const output = await PDFDocument.load(result.bytes);
      assert.deepEqual(output.getPage(0).getSize(), {
        width: 200,
        height: 400,
      });
    } finally {
      client.dispose();
    }
  },
);
