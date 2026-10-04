import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";
import * as pdfLib from "pdf-lib";
import { createArchive } from "../src/archive.ts";
import { processBatch } from "../src/batch.ts";
import { createConversionEngine } from "../src/conversion.ts";
import { DEFAULT_OPTIONS } from "../src/preferences.ts";

const fixture = async (name) => {
  const doc = await pdfLib.PDFDocument.create();
  doc.addPage([100, 200]);
  doc.addPage([300, 400]);
  return new File([await doc.save()], name);
};
const factory = () => {
  const engine = createConversionEngine(pdfLib);
  return {
    dispose() {},
    request(method, payload) {
      if (method === "load")
        return engine.load(payload.bytes, payload.metadata);
      if (method === "selectPage")
        return Promise.resolve(engine.selectPage(payload));
      return engine.generate(payload);
    },
  };
};
test("batch continues after invalid files and selects the requested page", async () => {
  const files = [
    await fixture("same.pdf"),
    new File(["bad"], "bad.pdf"),
    await fixture("same.pdf"),
  ];
  const entries = files.map((file, id) => ({
    id,
    file,
    pageNumber: id === 2 ? 2 : 1,
    status: "queued",
  }));
  const results = new Map();
  let disposals = 0;
  await processBatch(
    entries,
    DEFAULT_OPTIONS,
    new AbortController().signal,
    (id, patch) => results.set(id, { ...results.get(id), ...patch }),
    () => ({
      ...factory(),
      dispose() {
        disposals++;
      },
    }),
  );
  assert.equal(results.get(0).status, "ready");
  assert.equal(results.get(1).status, "failed");
  assert.match(results.get(1).error, /header/);
  assert.equal(results.get(2).status, "ready");
  assert.equal(results.get(2).output.filename, "same_page2_4up.pdf");
  const output = await pdfLib.PDFDocument.load(results.get(2).output.bytes);
  assert.deepEqual(output.getPage(0).getSize(), { width: 600, height: 800 });
  assert.equal(disposals, 3);
});
test("batch cancellation stops future files and ignores late results", async () => {
  const controller = new AbortController();
  const updates = [];
  let workers = 0,
    disposals = 0;
  const entries = [
    { id: 0, file: await fixture("a.pdf"), pageNumber: 1, status: "queued" },
    { id: 1, file: await fixture("b.pdf"), pageNumber: 1, status: "queued" },
  ];
  await processBatch(
    entries,
    DEFAULT_OPTIONS,
    controller.signal,
    (id, patch) => updates.push([id, patch.status]),
    () => {
      workers++;
      return {
        dispose() {
          disposals++;
        },
        async request() {
          controller.abort();
          return {};
        },
      };
    },
  );
  assert.equal(workers, 1);
  assert.ok(disposals >= 1);
  assert.deepEqual(updates, [[0, "processing"]]);
});
test("ZIP entries have unique safe names and preserve all PDF bytes", async () => {
  const bytes = new Uint8Array(await (await fixture("test.pdf")).arrayBuffer());
  const archive = createArchive([
    { filename: "../same.pdf", bytes },
    { filename: "../same.pdf", bytes },
  ]);
  const files = unzipSync(archive);
  assert.equal(Object.keys(files).length, 2);
  for (const [name, content] of Object.entries(files)) {
    assert.ok(!name.includes("/"));
    assert.deepEqual(content, bytes);
    assert.equal((await pdfLib.PDFDocument.load(content)).getPageCount(), 2);
  }
  assert.throws(() => createArchive([]), /between 1 and 20/);
});
