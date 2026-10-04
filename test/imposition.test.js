import assert from "node:assert/strict";
import test from "node:test";
import * as pdfLib from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createConversionEngine } from "../src/conversion.ts";
import { LAYOUTS } from "../src/geometry.ts";
import { parsePageRange } from "../src/imposition.ts";

const makeEngine = async (
  sizes = Array.from({ length: 6 }, () => [100, 200]),
) => {
  const source = await pdfLib.PDFDocument.create();
  sizes.forEach((size, index) => {
    source
      .addPage(size)
      .drawText(`Page ${index + 1}`, { x: 5, y: 10, size: 10 });
  });
  const bytes = await source.save();
  const engine = createConversionEngine(pdfLib);
  await engine.load(bytes, { name: "pages.pdf", size: bytes.length });
  return engine;
};
const options = { layout: LAYOUTS[4], paperMode: "a4", mode: "sequence" };

test("page ranges preserve entered order and enforce bounds before allocation", () => {
  assert.deepEqual(parsePageRange("", 3), [1, 2, 3]);
  assert.deepEqual(parsePageRange(" 3-4, 1, 1 ", 4), [3, 4, 1, 1]);
  for (const range of [
    "0",
    "1,",
    "2-1",
    "1-5",
    "abc",
    "1.5",
    "99999999999999999999",
  ])
    assert.throws(() => parsePageRange(range, 4));
  assert.throws(() => parsePageRange("1-10001", 10001), /10,000/);
});

test("sequential N-up preserves page content, ranges, order and the selected repeat page", async () => {
  const engine = await makeEngine();
  engine.selectPage(2);
  const result = await engine.generate({ ...options, pageRange: "3-6, 1" });
  assert.equal(result.sheets.length, 2);
  assert.deepEqual(
    result.sheets.map((sheet) => sheet.sourcePages),
    [[3, 4, 5, 6], [1]],
  );
  assert.equal(result.sheets[1].boxes.length, 1);
  assert.equal((await pdfLib.PDFDocument.load(result.bytes)).getPageCount(), 2);
  const task = getDocument({
    data: result.bytes.slice(),
    useSystemFonts: true,
  });
  try {
    const document = await task.promise;
    const text = (await (await document.getPage(1)).getTextContent()).items
      .map((item) => item.str)
      .filter(Boolean);
    assert.deepEqual(text, ["Page 3", "Page 4", "Page 5", "Page 6"]);
  } finally {
    await task.destroy();
  }
  const repeated = await engine.generate({
    layout: LAYOUTS[4],
    paperMode: "expand",
  });
  assert.deepEqual(repeated.sheets[0].sourcePages, [2, 2, 2, 2]);
  const columns = await engine.generate({ ...options, pageOrder: "columns" });
  const [a, b, c] = columns.sheets[0].boxes;
  assert.equal(a.x, b.x);
  assert.ok(a.y > b.y && c.x > a.x);
});

test("mixed page sizes fit without distortion and exact sizing reports the offending page", async () => {
  const engine = await makeEngine([
    [100, 100],
    [100, 500],
    [500, 100],
  ]);
  const result = await engine.generate(options);
  const boxes = result.sheets[0].boxes;
  assert.ok(Math.abs(boxes[1].height / boxes[1].width - 5) < 1e-9);
  assert.ok(Math.abs(boxes[2].width / boxes[2].height - 5) < 1e-9);
  await assert.rejects(
    engine.generate({ ...options, scaleMode: "percent", scalePercent: 100 }),
    /Source page 2/,
  );
});

test("output sheet limit rejects excessive jobs before generation", async () => {
  const engine = await makeEngine([[100, 100]]);
  await assert.rejects(
    engine.generate({
      ...options,
      layout: { rows: 1, columns: 1, copies: 1, custom: true },
      pageRange: Array(1001).fill("1").join(","),
    }),
    /1,000 sheets/,
  );
});

test("quantity creates partial or filled final sheets and embeds repeated content once", async () => {
  const engine = await makeEngine([[100, 200]]);
  const settings = {
    layout: LAYOUTS[4],
    paperMode: "a4",
    quantity: 5,
    cropMarks: true,
  };
  const exact = await engine.generate(settings);
  assert.deepEqual(
    exact.sheets.map((sheet) => sheet.boxes.length),
    [4, 1],
  );
  assert.match(exact.filename, /qty5/);
  const pdf = await pdfLib.PDFDocument.load(exact.bytes);
  const formRefs = pdf.getPages().map((page) =>
    page.node
      .Resources()
      .lookup(pdfLib.PDFName.of("XObject"), pdfLib.PDFDict)
      .values()
      .map((ref) => ref.toString()),
  );
  assert.equal(new Set(formRefs.flat()).size, 1);
  const filled = await engine.generate({ ...settings, fillLastSheet: true });
  assert.deepEqual(
    filled.sheets.map((sheet) => sheet.boxes.length),
    [4, 4],
  );
  assert.match(filled.filename, /qty8/);
  for (const quantity of [0, -1, 1.5, 10001, NaN])
    await assert.rejects(
      engine.generate({ ...settings, quantity }),
      /Quantity/,
    );
  const single = await engine.generate({ ...settings, quantity: undefined });
  assert.equal(single.sheets.length, 1);
  assert.equal(single.sheets[0].boxes.length, 4);
});

test("sequential exact height remains fixed across different page proportions", async () => {
  const engine = await makeEngine([
    [100, 100],
    [100, 500],
  ]);
  const result = await engine.generate({
    ...options,
    scaleMode: "dimensions",
    dimensionAxis: "height",
    copyHeightMm: 50,
  });
  const boxes = result.sheets[0].boxes;
  assert.ok(Math.abs((boxes[0].height * 25.4) / 72 - 50) < 1e-9);
  assert.ok(Math.abs((boxes[1].height * 25.4) / 72 - 50) < 1e-9);
  assert.ok(Math.abs((boxes[1].width * 25.4) / 72 - 10) < 1e-9);
});
