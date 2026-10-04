import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as pdfLib from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createConversionEngine } from "../src/conversion.ts";
import { LAYOUTS } from "../src/geometry.ts";

const options = { layout: LAYOUTS[4], paperMode: "expand" };
const fixture = async (configure = () => {}, dimensions = [100, 200]) => {
  const document = await pdfLib.PDFDocument.create();
  const page = document.addPage(dimensions);
  await configure(page, document);
  return document.save();
};
const load = async (bytes) => {
  const engine = createConversionEngine(pdfLib);
  const metadata = await engine.load(bytes, {
    name: "fixture.pdf",
    size: bytes.length,
  });
  return { engine, metadata };
};
const outputPage = async (result) =>
  (await pdfLib.PDFDocument.load(result.bytes)).getPage(0);

test("valid blank pages with absent or empty Contents convert successfully", async () => {
  for (const configure of [
    () => {},
    (page, doc) =>
      page.node.set(pdfLib.PDFName.of("Contents"), doc.context.obj([])),
  ]) {
    const { engine } = await load(await fixture(configure));
    const result = await engine.generate(options);
    assert.equal(result.filename, "fixture_4up.pdf");
    assert.deepEqual((await outputPage(result)).getSize(), {
      width: 200,
      height: 400,
    });
  }
});

test("CropBox clipping, UserUnit and rotation survive actual PDF serialisation", async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const { engine, metadata } = await load(
      await fixture((page) => {
        page.drawText("Hello", { x: 10, y: 20, size: 10 });
        page.setCropBox(-50, -50, 200, 300);
        page.setRotation(pdfLib.degrees(rotation));
        page.node.set(pdfLib.PDFName.of("UserUnit"), pdfLib.PDFNumber.of(2));
      }),
    );
    assert.deepEqual(metadata.cropBox, { x: 0, y: 0, width: 100, height: 200 });
    const result = await engine.generate(options);
    assert.deepEqual(
      (await outputPage(result)).getSize(),
      rotation % 180
        ? { width: 800, height: 400 }
        : { width: 400, height: 800 },
    );
    // Independently parse the result with PDF.js. Every copied text transform
    // must have doubled glyph scale, and there must be exactly four copies.
    const task = getDocument({
      data: result.bytes.slice(),
      stopAtErrors: true,
      standardFontDataUrl: fileURLToPath(
        new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url),
      ).replaceAll("\\", "/"),
    });
    try {
      const pdf = await task.promise;
      const text = await (await pdf.getPage(1)).getTextContent();
      const copies = text.items.filter((item) => item.str === "Hello");
      assert.equal(copies.length, 4);
      for (const copy of copies) {
        assert.ok(
          Math.abs(Math.hypot(copy.transform[0], copy.transform[1]) - 20) <
            1e-6,
        );
      }
    } finally {
      await task.destroy();
    }
  }
});

test("oversized expansion preserves the source for source-page-size recovery", async () => {
  const { engine } = await load(await fixture(() => {}, [8000, 8000]));
  await assert.rejects(engine.generate(options), /5,080 mm/);
  assert.deepEqual(
    (
      await outputPage(await engine.generate({ ...options, paperMode: "same" }))
    ).getSize(),
    { width: 8000, height: 8000 },
  );
});

test("margins and gutters enlarge expanded sheets without changing copy scale", async () => {
  const { engine } = await load(
    await fixture((page) => page.drawText("Spacing", { size: 10 })),
  );
  const result = await engine.generate({
    ...options,
    marginMm: 25.4,
    gutterMm: 12.7,
  });
  assert.deepEqual((await outputPage(result)).getSize(), {
    width: 380,
    height: 580,
  });
  await assert.rejects(
    engine.generate({ ...options, paperMode: "same", marginMm: 100 }),
    /no space/,
  );
  await assert.rejects(
    engine.generate({ ...options, gutterMm: -1 }),
    /between 0 and 100/,
  );
});

test("invalid geometry, units, rotation and multi-page documents are rejected", async () => {
  for (const configure of [
    (page) => page.setCropBox(200, 0, 10, 10),
    (page) =>
      page.node.set(pdfLib.PDFName.of("UserUnit"), pdfLib.PDFNumber.of(0)),
    (page) =>
      page.node.set(pdfLib.PDFName.of("Rotate"), pdfLib.PDFNumber.of(45)),
    (_page, document) => document.addPage(),
  ])
    await assert.rejects(load(await fixture(configure)));
  await assert.rejects(
    load(new TextEncoder().encode("%PDF-1.7\nnot a PDF")),
    /could not be parsed|exactly one page/,
  );
});

test("annotations and form fields generate a persistent source warning", async () => {
  const { engine, metadata } = await load(
    await fixture((page, doc) => {
      const field = doc.getForm().createTextField("name");
      field.setText("Important value");
      field.addToPage(page, { x: 10, y: 20, width: 80, height: 20 });
    }),
  );
  assert.match(
    metadata.warnings.join(" "),
    /appearances, values and links are not copied/,
  );
  const result = await engine.generate(options);
  assert.equal((await outputPage(result)).node.Annots()?.size() ?? 0, 0);
});

test("a bounded complex content fixture can be converted repeatedly", {
  timeout: 10_000,
}, async () => {
  const { engine } = await load(
    await fixture((page) => {
      for (let i = 0; i < 2000; i++)
        page.drawRectangle({ x: i % 100, y: i % 200, width: 1, height: 1 });
    }),
  );
  for (const layout of [LAYOUTS[16], LAYOUTS[2], LAYOUTS[9]]) {
    const result = await engine.generate({ layout, paperMode: "same" });
    assert.equal(
      (await pdfLib.PDFDocument.load(result.bytes)).getPageCount(),
      1,
    );
    assert.ok(result.bytes.length < 1_000_000);
  }
});

test("page transparency groups preserve indirect colour spaces across repeated conversions", async () => {
  const { engine } = await load(
    await fixture((page, doc) => {
      page.drawRectangle({ width: 70, height: 70, opacity: 0.5 });
      page.drawRectangle({ x: 30, y: 30, width: 70, height: 70, opacity: 0.5 });
      const colourSpace = doc.context.register(
        doc.context.obj(["CalRGB", { WhitePoint: [0.9505, 1, 1.089] }]),
      );
      const group = doc.context.register(
        doc.context.obj({
          Type: "Group",
          S: "Transparency",
          CS: colourSpace,
          I: true,
          K: true,
        }),
      );
      page.node.set(pdfLib.PDFName.of("Group"), group);
    }),
  );
  for (const layout of [LAYOUTS[4], LAYOUTS[2]]) {
    const result = await engine.generate({ ...options, layout });
    const document = await pdfLib.PDFDocument.load(result.bytes);
    const forms = document.context
      .enumerateIndirectObjects()
      .filter(
        ([, object]) =>
          object instanceof pdfLib.PDFRawStream &&
          object.dict.get(pdfLib.PDFName.of("Subtype"))?.toString() === "/Form",
      );
    assert.equal(forms.length, 1);
    const group = forms[0][1].dict.lookup(
      pdfLib.PDFName.of("Group"),
      pdfLib.PDFDict,
    );
    assert.equal(
      group.lookup(pdfLib.PDFName.of("S")).toString(),
      "/Transparency",
    );
    assert.equal(group.lookup(pdfLib.PDFName.of("I")).toString(), "true");
    assert.equal(group.lookup(pdfLib.PDFName.of("K")).toString(), "true");
    const colourSpace = group.lookup(pdfLib.PDFName.of("CS"), pdfLib.PDFArray);
    assert.equal(colourSpace.lookup(0).toString(), "/CalRGB");
    assert.equal(
      colourSpace
        .lookup(1, pdfLib.PDFDict)
        .lookup(pdfLib.PDFName.of("WhitePoint"), pdfLib.PDFArray)
        .size(),
      3,
    );
  }
});
