import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as pdfLib from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createConversionEngine } from "../src/conversion.ts";
import {
  getArtworkBox,
  getCopyBoxes,
  getCropMarkLines,
  getOutputGeometry,
  getTrimOffset,
  resolveSourceGeometry,
} from "../src/geometry.ts";
import { DEFAULT_OPTIONS, parsePreferences } from "../src/preferences.ts";

const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const settings = {
  layout: { custom: true, copies: 2, columns: 2, rows: 1 },
  paperMode: "expand",
  sourceBox: "trim",
  bleedMm: 2.54,
};

test("bleed reserves output-space margins and gaps at any copy scale", () => {
  for (const percent of [50, 100, 200]) {
    const options = {
      ...settings,
      width: 100,
      height: 200,
      scaleMode: "percent",
      scalePercent: percent,
    };
    const geometry = getOutputGeometry(options);
    const boxes = getCopyBoxes(options);
    near(geometry.outputWidth, (200 * percent) / 100 + 28.8);
    near(geometry.outputHeight, (200 * percent) / 100 + 14.4);
    near(boxes[0].x, 7.2);
    near(boxes[1].x - boxes[0].x - boxes[0].width, 14.4);
    const marks = getCropMarkLines(boxes[0], undefined, settings.bleedMm);
    near(boxes[0].x - marks[0].start.x, 7.2 + 72 / 25.4);
  }
  for (const bleedMm of [-1, 21, Number.NaN])
    assert.throws(
      () =>
        getOutputGeometry({ ...settings, width: 100, height: 200, bleedMm }),
      /Bleed/,
    );
});

test("asymmetric source artwork is bounded and trim offsets follow rotation", () => {
  const trim = { x: 20, y: 30, width: 100, height: 200 };
  const artwork = getArtworkBox(
    trim,
    { x: 18, y: 26, width: 112, height: 220 },
    8,
  );
  assert.deepEqual(artwork, { x: 18, y: 26, width: 110, height: 212 });
  for (const [rotation, offset] of [
    [0, { x: 2, y: 4 }],
    [90, { x: 4, y: 8 }],
    [180, { x: 8, y: 8 }],
    [270, { x: 8, y: 2 }],
  ])
    assert.deepEqual(getTrimOffset(trim, artwork, rotation), offset);
  const source = {
    cropBox: { x: 0, y: 0, width: 200, height: 300 },
    trimBox: trim,
    width: 600,
    height: 400,
    rotation: 90,
    userUnit: 2,
  };
  assert.equal(resolveSourceGeometry(source), source);
  const selected = resolveSourceGeometry(source, "trim");
  assert.equal(selected.width, 400);
  assert.equal(selected.height, 200);
});

test("trim and bleed preferences validate and round-trip", () => {
  const parsed = parsePreferences({
    ...DEFAULT_OPTIONS,
    sourceBox: "trim",
    bleedMm: 3,
  });
  assert.equal(parsed.sourceBox, "trim");
  assert.equal(parsed.bleedMm, 3);
  for (const patch of [
    { sourceBox: "media" },
    { bleedMm: -1 },
    { bleedMm: 20.1 },
  ])
    assert.equal(parsePreferences({ ...DEFAULT_OPTIONS, ...patch }), null);
});

test("trim embedding keeps finished artwork aligned through source and sheet rotation", async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const source = await pdfLib.PDFDocument.create();
    const page = source.addPage([200, 300]);
    page.setCropBox(10, 20, 180, 260);
    page.setTrimBox(20, 30, 100, 200);
    page.setBleedBox(18, 26, 112, 220);
    page.setRotation(pdfLib.degrees(rotation));
    page.node.set(pdfLib.PDFName.of("UserUnit"), pdfLib.PDFNumber.of(2));
    page.drawText("T", { x: 20, y: 30, size: 10 });
    const bytes = await source.save();
    const engine = createConversionEngine(pdfLib);
    const metadata = await engine.load(bytes, {
      name: "trim.pdf",
      size: bytes.length,
    });
    assert.deepEqual(metadata.trimBox, {
      x: 20,
      y: 30,
      width: 100,
      height: 200,
    });
    const options = {
      ...settings,
      layout: { custom: true, copies: 1, columns: 1, rows: 1 },
      bleedMm: 2.54,
      outputRotation: 90,
    };
    const result = await engine.generate(options);
    assert.match(result.warnings.join(" "), /insufficient available bleed/);
    const sheet = result.sheets[0];
    near(sheet.bleedBoxes[0].x, 0);
    near(sheet.bleedBoxes[0].y, 0);
    near(sheet.bleedBoxes[0].width, sheet.outputWidth);
    const output = await pdfLib.PDFDocument.load(result.bytes);
    const saved = output.getPage(0);
    near(saved.getBleedBox().x, 0);
    near(saved.getTrimBox().x, 7.2);
    const form = output.context
      .enumerateIndirectObjects()
      .find(
        ([, obj]) =>
          obj instanceof pdfLib.PDFRawStream &&
          obj.dict.get(pdfLib.PDFName.of("Subtype"))?.toString() === "/Form",
      )[1];
    const bbox = form.dict
      .lookup(pdfLib.PDFName.of("BBox"), pdfLib.PDFArray)
      .asArray()
      .map((n) => n.asNumber());
    // 7.2 output points are 3.6 source units at UserUnit=2; only the left edge is short.
    [18, 26.4, 123.6, 233.6].forEach((expected, i) => {
      near(bbox[i], expected);
    });
    const task = getDocument({
      data: result.bytes.slice(),
      standardFontDataUrl: fileURLToPath(
        new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url),
      ).replaceAll("\\", "/"),
    });
    try {
      const pdf = await task.promise;
      const text = (await (await pdf.getPage(1)).getTextContent()).items.find(
        (item) => item.str === "T",
      );
      assert.ok(text);
      // Text remains anchored at the trim origin before the sheet display rotation.
      const trim = saved.getTrimBox();
      const expected =
        rotation === 0
          ? [trim.x, trim.y]
          : rotation === 90
            ? [trim.x, trim.y + trim.height]
            : rotation === 180
              ? [trim.x + trim.width, trim.y + trim.height]
              : [trim.x + trim.width, trim.y];
      near(text.transform[4], expected[0]);
      near(text.transform[5], expected[1]);
    } finally {
      await task.destroy();
    }
  }
});
