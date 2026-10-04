import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as pdfLib from "pdf-lib";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createConversionEngine } from "../src/conversion.ts";
import { LAYOUTS } from "../src/geometry.ts";

const assetPath = (directory) =>
  fileURLToPath(
    new URL(`../node_modules/pdfjs-dist/${directory}/`, import.meta.url),
  ).replaceAll("\\", "/");
const loadOutput = async (document) => {
  const engine = createConversionEngine(pdfLib);
  const bytes = await document.save();
  await engine.load(bytes, { name: "assets.pdf", size: bytes.length });
  const result = await engine.generate({
    layout: LAYOUTS[4],
    paperMode: "expand",
  });
  return getDocument({
    data: result.bytes,
    stopAtErrors: true,
    useWorkerFetch: false,
    cMapUrl: assetPath("cmaps"),
    standardFontDataUrl: assetPath("standard_fonts"),
    wasmUrl: assetPath("wasm"),
    iccUrl: assetPath("iccs"),
  });
};

test("bundled JPEG 2000 decoder preserves an image through imposition", async () => {
  const document = await pdfLib.PDFDocument.create();
  const page = document.addPage([100, 100]);
  const image = document.context.register(
    document.context.stream(
      new Uint8Array(
        await readFile(new URL("./fixtures/red.jp2", import.meta.url)),
      ),
      {
        Type: "XObject",
        Subtype: "Image",
        Width: 4,
        Height: 4,
        BitsPerComponent: 8,
        ColorSpace: "DeviceRGB",
        Filter: "JPXDecode",
      },
    ),
  );
  page.node.set(
    pdfLib.PDFName.of("Resources"),
    document.context.obj({ XObject: { Im0: image } }),
  );
  page.node.set(
    pdfLib.PDFName.of("Contents"),
    document.context.register(
      document.context.flateStream("q 100 0 0 100 0 0 cm /Im0 Do Q"),
    ),
  );
  const task = await loadOutput(document);
  try {
    const pdf = await task.promise;
    const renderedPage = await pdf.getPage(1);
    const operators = await renderedPage.getOperatorList();
    const images = operators.fnArray.flatMap((fn, index) =>
      fn === OPS.paintImageXObject ? [operators.argsArray[index][0]] : [],
    );
    assert.equal(images.length, 4);
    const decoded = await new Promise((resolve) =>
      renderedPage.objs.get(images[0], resolve),
    );
    assert.equal(decoded.width, 4);
    assert.equal(decoded.height, 4);
    assert.deepEqual(Array.from(decoded.data.slice(0, 3)), [255, 0, 0]);
  } finally {
    await task.destroy();
  }
});

test("bundled Japanese CMaps resolve text in all imposed copies", async () => {
  const document = await pdfLib.PDFDocument.create();
  const page = document.addPage([100, 100]);
  const descendant = document.context.register(
    document.context.obj({
      Type: "Font",
      Subtype: "CIDFontType0",
      BaseFont: "HeiseiMin-W3",
      CIDSystemInfo: {
        Registry: pdfLib.PDFString.of("Adobe"),
        Ordering: pdfLib.PDFString.of("Japan1"),
        Supplement: 5,
      },
    }),
  );
  const font = document.context.register(
    document.context.obj({
      Type: "Font",
      Subtype: "Type0",
      BaseFont: "HeiseiMin-W3",
      Encoding: "UniJIS-UTF16-H",
      DescendantFonts: [descendant],
    }),
  );
  page.node.set(
    pdfLib.PDFName.of("Resources"),
    document.context.obj({ Font: { F0: font } }),
  );
  page.node.set(
    pdfLib.PDFName.of("Contents"),
    document.context.register(
      document.context.flateStream("BT /F0 12 Tf 10 20 Td <3042> Tj ET"),
    ),
  );
  const task = await loadOutput(document);
  try {
    const pdf = await task.promise;
    const text = await (await pdf.getPage(1)).getTextContent();
    assert.equal(text.items.filter((item) => item.str === "あ").length, 4);
  } finally {
    await task.destroy();
  }
});
