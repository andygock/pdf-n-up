import assert from "node:assert/strict";
import test from "node:test";
import { drawMeasurements } from "../src/measurements.ts";

test("measurement overlay shows dimensions without rectangular copy outlines", () => {
  const boxes = [],
    labels = [];
  const context = {
    save() {},
    restore() {},
    strokeRect(...args) {
      boxes.push(args);
    },
    measureText() {
      return { width: 80 };
    },
    fillRect() {},
    fillText(text) {
      labels.push(text);
    },
  };
  drawMeasurements(context, 400, 600, {
    outputWidth: 200,
    outputHeight: 300,
    boxes: [{ x: 10, y: 20, width: 50, height: 100 }],
    margin: 10,
    gutter: 5,
  });
  assert.deepEqual(boxes, []);
  assert.ok(
    labels.some(
      (text) => text.includes("17.64 mm") && text.includes("35.28 mm"),
    ),
  );
  assert.ok(
    labels.some((text) => text.includes("margin:") && text.includes("gap:")),
  );
});
