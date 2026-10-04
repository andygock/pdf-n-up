import assert from "node:assert/strict";
import test from "node:test";

import {
  getCopyBoxes,
  getCropMarkLines,
  getOutputGeometry,
  getResolvedLayout,
  getRotatedDrawOptions,
  getVisiblePageGeometry,
  LAYOUTS,
  makeOutputFilename,
} from "../src/geometry.ts";

const closeTo = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("rectangular layouts transpose for landscape pages", () => {
  assert.deepEqual(getResolvedLayout(LAYOUTS[8], 800, 600), {
    copies: 8,
    columns: 2,
    rows: 4,
  });
  assert.deepEqual(getResolvedLayout(LAYOUTS[8], 600, 800), LAYOUTS[8]);
});

test("expanded output preserves scale and multiplies dimensions", () => {
  assert.deepEqual(
    getOutputGeometry({
      width: 600,
      height: 800,
      layout: LAYOUTS[4],
      paperMode: "expand",
    }),
    { outputWidth: 1200, outputHeight: 1600, scale: 1 },
  );
});

test("source-size output chooses the orientation with the best fit", () => {
  const geometry = getOutputGeometry({
    width: 600,
    height: 800,
    layout: LAYOUTS[2],
    paperMode: "same",
  });

  assert.equal(geometry.outputWidth, 800);
  assert.equal(geometry.outputHeight, 600);
  closeTo(geometry.scale, 2 / 3);
});

test("visible geometry uses CropBox and swaps axes for quarter turns", () => {
  const cropBox = { x: 20, y: 30, width: 200, height: 100 };

  assert.deepEqual(getVisiblePageGeometry(cropBox, 0), {
    cropBox,
    rotation: 0,
    userUnit: 1,
    width: 200,
    height: 100,
  });
  assert.deepEqual(getVisiblePageGeometry(cropBox, 450), {
    cropBox,
    rotation: 90,
    userUnit: 1,
    width: 100,
    height: 200,
  });
});

test("rotated draw transforms keep content inside the requested bounds", () => {
  const sourceWidth = 200;
  const sourceHeight = 100;
  const scale = 0.5;
  const left = 13;
  const bottom = 17;

  for (const rotation of [0, 90, 180, 270]) {
    const options = getRotatedDrawOptions({
      left,
      bottom,
      sourceWidth,
      sourceHeight,
      scale,
      rotation,
    });
    const radians = (options.degrees * Math.PI) / 180;
    const corners = [
      [0, 0],
      [sourceWidth, 0],
      [0, sourceHeight],
      [sourceWidth, sourceHeight],
    ].map(([x, y]) => {
      const scaledX = x * options.xScale;
      const scaledY = y * options.yScale;
      return [
        options.x + scaledX * Math.cos(radians) - scaledY * Math.sin(radians),
        options.y + scaledX * Math.sin(radians) + scaledY * Math.cos(radians),
      ];
    });
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const expectedWidth =
      rotation === 90 || rotation === 270
        ? sourceHeight * scale
        : sourceWidth * scale;
    const expectedHeight =
      rotation === 90 || rotation === 270
        ? sourceWidth * scale
        : sourceHeight * scale;

    closeTo(Math.min(...xs), left);
    closeTo(Math.max(...xs), left + expectedWidth);
    closeTo(Math.min(...ys), bottom);
    closeTo(Math.max(...ys), bottom + expectedHeight);
  }
});

test("output filenames replace only a final PDF extension", () => {
  assert.equal(makeOutputFilename("handout.PDF", 8), "handout_8up.pdf");
  assert.equal(makeOutputFilename("draft.v2", 4), "draft.v2_4up.pdf");
  assert.equal(makeOutputFilename("  ", 2), "document_2up.pdf");
});

test("fixed paper sizes and custom dimensions choose the best orientation", () => {
  const source = { width: 100, height: 200, layout: LAYOUTS[4] };
  for (const [paperMode, short, long] of [
    ["a4", 210, 297],
    ["a3", 297, 420],
    ["custom", 120, 180],
  ]) {
    const result = getOutputGeometry({
      ...source,
      paperMode,
      paperWidthMm: 120,
      paperHeightMm: 180,
    });
    assert.ok(
      Math.abs(
        Math.min(result.outputWidth, result.outputHeight) - (short * 72) / 25.4,
      ) < 1e-8,
    );
    assert.ok(
      Math.abs(
        Math.max(result.outputWidth, result.outputHeight) - (long * 72) / 25.4,
      ) < 1e-8,
    );
  }
  assert.throws(
    () =>
      getOutputGeometry({ ...source, paperMode: "custom", paperWidthMm: 0 }),
    /Custom paper/,
  );
});

test("crop marks remain inside the sheet and outside every copy", () => {
  const options = {
    width: 100,
    height: 200,
    layout: LAYOUTS[4],
    paperMode: "expand",
    cropMarks: true,
  };
  const sheet = getOutputGeometry(options);
  const boxes = getCopyBoxes(options);
  assert.equal(sheet.scale, 1);
  for (const box of boxes)
    for (const line of getCropMarkLines(box))
      for (const point of [line.start, line.end]) {
        assert.ok(
          point.x >= 0 &&
            point.y >= 0 &&
            point.x <= sheet.outputWidth &&
            point.y <= sheet.outputHeight,
        );
        for (const other of boxes)
          assert.ok(
            point.x < other.x ||
              point.x > other.x + other.width ||
              point.y < other.y ||
              point.y > other.y + other.height,
          );
      }
});
