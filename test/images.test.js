import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as pdfLib from "pdf-lib";
import { processBatch } from "../src/batch.ts";
import { createConversionEngine } from "../src/conversion.ts";
import { DEFAULT_OPTIONS } from "../src/preferences.ts";
import { readSourceFile } from "../src/read-source-file.ts";

const fixture = async (name) =>
  new File(
    [await readFile(new URL(`fixtures/${name}`, import.meta.url))],
    name,
  );

test("JPEG and transparent PNG sources produce repeated and sequential PDF output", async () => {
  for (const name of ["red.jpg", "red-alpha.png"]) {
    const file = await fixture(name);
    const bytes = await readSourceFile(file, new AbortController().signal);
    const engine = createConversionEngine(pdfLib);
    const metadata = await engine.load(bytes, file);
    assert.equal(metadata.pageCount, 1);
    assert.equal(metadata.width, 72);
    assert.equal(metadata.height, 36);
    for (const mode of ["repeat", "sequence"]) {
      const result = await engine.generate({ ...DEFAULT_OPTIONS, mode });
      assert.equal(
        result.filename,
        `${name.replace(/\.(jpg|png)$/, "")}${mode === "sequence" ? "_pages" : ""}_4up.pdf`,
      );
      const document = await pdfLib.PDFDocument.load(result.bytes);
      assert.equal(document.getPageCount(), 1);
      assert.deepEqual(document.getPage(0).getSize(), {
        width: 144,
        height: 72,
      });
      const images = document.context
        .enumerateIndirectObjects()
        .filter(
          ([, object]) =>
            object instanceof pdfLib.PDFRawStream &&
            object.dict.get(pdfLib.PDFName.of("Subtype"))?.toString() ===
              "/Image",
        );
      assert.ok(images.length > 0);
      if (name.endsWith("png"))
        assert.ok(
          images.some(([, image]) =>
            image.dict.has(pdfLib.PDFName.of("SMask")),
          ),
        );
    }
  }
});

test("image validation rejects mismatched headers, malformed images and cancelled reads", async () => {
  for (const name of ["bad.jpg", "bad.png"])
    await assert.rejects(
      readSourceFile(new File(["%PDF-"], name), new AbortController().signal),
      /image header/,
    );
  const engine = createConversionEngine(pdfLib);
  await assert.rejects(
    engine.load(new Uint8Array([255, 216, 255]), { name: "bad.jpg", size: 3 }),
    /image could not be parsed/,
  );
  await assert.rejects(engine.generate(DEFAULT_OPTIONS), /Select/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readSourceFile(await fixture("red.jpg"), controller.signal),
    { name: "AbortError" },
  );
});

test("mixed PDF and image batches produce separate PDFs and continue after an invalid image", async () => {
  const document = await pdfLib.PDFDocument.create();
  document.addPage([72, 36]);
  const files = [
    new File([await document.save()], "page.pdf"),
    await fixture("red.jpg"),
    new File(["bad"], "bad.png"),
    await fixture("red-alpha.png"),
  ];
  const results = new Map();
  await processBatch(
    files.map((file, id) => ({ id, file, pageNumber: 1, status: "queued" })),
    DEFAULT_OPTIONS,
    new AbortController().signal,
    (id, patch) => results.set(id, { ...results.get(id), ...patch }),
    () => {
      const engine = createConversionEngine(pdfLib);
      return {
        dispose() {},
        request(method, payload) {
          return method === "load"
            ? engine.load(payload.bytes, payload.metadata)
            : engine.generate(payload);
        },
      };
    },
  );
  assert.deepEqual(
    [...results.values()].map((entry) => entry.status),
    ["ready", "ready", "failed", "ready"],
  );
  assert.equal(results.get(1).output.filename, "red_4up.pdf");
  assert.equal(results.get(3).output.filename, "red-alpha_4up.pdf");
});
