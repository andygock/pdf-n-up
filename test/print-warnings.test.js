import assert from "node:assert/strict";
import test from "node:test";
import { printWarningSeverity, printWarnings } from "../src/print-warnings.ts";

const mm = 72 / 25.4;
const sheet = {
  outputWidth: 210 * mm,
  outputHeight: 297 * mm,
  boxes: [{ x: 10 * mm, y: 10 * mm, width: 90 * mm, height: 50 * mm }],
  scales: [0.5],
};
test("print warnings distinguish paper limits and ignore PDF image resolution", () => {
  assert.deepEqual(printWarnings([sheet], "file.pdf"), []);
  assert.deepEqual(printWarnings([sheet], "file.png"), []);
  assert.match(
    printWarnings(
      [{ ...sheet, outputWidth: 420 * mm, outputHeight: 297 * mm }],
      "file.pdf",
    )[0],
    /exceeds A4/,
  );
  assert.match(
    printWarnings([{ ...sheet, outputWidth: 500 * mm }], "file.pdf")[0],
    /exceeds A3/,
  );
});
test("print warnings inspect every sheet and actual artwork edges", () => {
  const warnings = printWarnings(
    [sheet, { ...sheet, boxes: [{ ...sheet.boxes[0], x: 0 }], scales: [2] }],
    "file.jpg",
  );
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /within 5 mm/);
  assert.match(warnings[1], /48 ppi/);
});

test("warning severity uses the strongest issue across sheets", () => {
  assert.equal(printWarningSeverity([sheet], "file.pdf"), "warning");
  assert.equal(
    printWarningSeverity([{ ...sheet, outputWidth: 500 * mm }], "file.pdf"),
    "danger",
  );
  assert.equal(
    printWarningSeverity([sheet, { ...sheet, scales: [2] }], "file.jpg"),
    "danger",
  );
  assert.equal(
    printWarningSeverity([{ ...sheet, scales: [2] }], "file.pdf"),
    "warning",
  );
  assert.equal(
    printWarningSeverity([{ ...sheet, scales: [1] }], "file.png"),
    "warning",
  );
  assert.equal(
    printWarningSeverity([{ ...sheet, scales: [96 / 72] }], "file.png"),
    "warning",
  );
});
