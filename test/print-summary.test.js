import assert from "node:assert/strict";
import test from "node:test";
import { summarisePrint } from "../src/print-summary.ts";

const mm = 72 / 25.4;
const box = (width = 90, height = 50) => ({
  x: 0,
  y: 0,
  width: width * mm,
  height: height * mm,
});
const sheet = (boxes) => ({
  outputWidth: 210 * mm,
  outputHeight: 297 * mm,
  capacity: 4,
  boxes,
  scales: boxes.map(() => 1),
  sourcePages: boxes.map(() => 1),
  margin: 0,
  gutter: 0,
});

test("print summary counts quantities and identifies unused final cells", () => {
  const summary = summarisePrint([
    sheet([box(), box(), box(), box()]),
    sheet([box()]),
  ]);
  assert.equal(summary.copies, 5);
  assert.equal(summary.sheetCount, 2);
  assert.equal(summary.unused, 3);
  assert.equal(summary.copySize, "90 \u00d7 50 mm");
  assert.equal(summary.scale, "100%");
  assert.match(summary.paper, /A4/);
  assert.deepEqual(
    summary.variants.map((item) => item.count),
    [5],
  );
});

test("mixed dimensions remain explicit and are grouped for detailed inspection", () => {
  const source = sheet([box(), box(50, 90), box(50, 90)]);
  source.scales = [1, 0.5, 0.5];
  const summary = summarisePrint([source]);
  assert.equal(summary.copySize, "Varied copy sizes");
  assert.equal(summary.scale, "50\u2013100%");
  assert.deepEqual(
    summary.variants.map((item) => item.count),
    [1, 2],
  );
  assert.equal(summarisePrint([]), null);
});
