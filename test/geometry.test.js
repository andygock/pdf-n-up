import assert from "node:assert/strict";
import test from "node:test";

import {
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
