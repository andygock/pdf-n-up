import {
  assertCompatibleOutputSize,
  getOutputGeometry,
  getResolvedLayout,
  getRotatedDrawOptions,
  getVisiblePageGeometry,
  makeOutputFilename,
} from "./geometry.js";

// The browser runs this engine only inside a terminable worker. Accepting the
// library explicitly also lets Node tests exercise the same PDF pipeline.
export const createConversionEngine = (pdfLib) => {
  let source = null;

  return {
    async load(bytes, { name, size }) {
      source = null;
      let document;
      let pageCount;
      try {
        document = await pdfLib.PDFDocument.load(bytes, {
          ignoreEncryption: false,
          updateMetadata: false,
          throwOnInvalidObject: true,
        });
        // pdf-lib resolves some damaged documents before their page tree is
        // traversed. Treat deferred structural failures as parse failures too.
        pageCount = document.getPageCount();
      } catch (error) {
        throw new Error(
          /encrypt|password/i.test(error.message)
            ? "Password-protected or encrypted PDFs are not supported."
            : "The PDF could not be parsed. It may be damaged or unsupported.",
          { cause: error },
        );
      }
      if (pageCount !== 1) {
        throw new Error(
          `This application accepts exactly one page. The selected PDF contains ${pageCount} pages.`,
        );
      }
      const page = document.getPage(0);
      const unit =
        page.node
          .lookupMaybe(pdfLib.PDFName.of("UserUnit"), pdfLib.PDFNumber)
          ?.asNumber() ?? 1;
      const geometry = getVisiblePageGeometry(
        page.getCropBox(),
        page.getRotation().angle,
        page.getMediaBox(),
        unit,
      );
      const warnings = [];
      if (
        page.node.Annots()?.size() ||
        document.catalog.has(pdfLib.PDFName.of("AcroForm"))
      ) {
        warnings.push(
          "This PDF contains annotations or form fields. Their appearances, values and links are not copied; flatten them in a PDF editor first if they must appear in print.",
        );
      }
      const metadata = { name, size, ...geometry, warnings };
      // Output compatibility belongs to generate(), so changing paper mode can
      // recover from an oversized layout without selecting the source again.
      source = { page, document, ...metadata };
      return metadata;
    },

    async generate(options) {
      if (!source) throw new Error("Select a PDF before converting.");
      const { outputWidth, outputHeight, scale } = getOutputGeometry({
        ...source,
        ...options,
      });
      assertCompatibleOutputSize({ outputWidth, outputHeight });
      const { columns, rows, copies } = getResolvedLayout(
        options.layout,
        source.width,
        source.height,
      );
      const filename = makeOutputFilename(source.name, copies);
      const output = await pdfLib.PDFDocument.create();
      output.setTitle(filename.replace(/\.pdf$/i, ""));
      output.setSubject(`${copies}-up PDF layout`);
      output.setCreator("PDF N-up browser application");
      output.setProducer("pdf-lib");
      const outputPage = output.addPage([outputWidth, outputHeight]);
      const { x, y, width, height } = source.cropBox;
      // Missing /Contents is valid for a blank PDF page. Avoid asking pdf-lib
      // to embed it: there is no visual content to repeat.
      const contents = source.page.node.Contents();
      const blank =
        !contents ||
        (contents instanceof pdfLib.PDFArray && contents.size() === 0);
      if (!blank) {
        const embedded = await output.embedPage(source.page, {
          left: x,
          bottom: y,
          right: x + width,
          top: y + height,
        });
        const margin = ((options.marginMm ?? 0) * 72) / 25.4;
        const gutter = ((options.gutterMm ?? 0) * 72) / 25.4;
        const cellWidth =
          (outputWidth - 2 * margin - (columns - 1) * gutter) / columns;
        const cellHeight =
          (outputHeight - 2 * margin - (rows - 1) * gutter) / rows;
        const xOffset = (cellWidth - source.width * scale) / 2;
        const yOffset = (cellHeight - source.height * scale) / 2;
        for (let index = 0; index < copies; index += 1) {
          const column = index % columns;
          const row = rows - 1 - Math.floor(index / columns);
          const draw = getRotatedDrawOptions({
            left: margin + column * (cellWidth + gutter) + xOffset,
            bottom: margin + row * (cellHeight + gutter) + yOffset,
            sourceWidth: width,
            sourceHeight: height,
            // Embedded streams retain source units; output pages use points.
            scale: scale * source.userUnit,
            rotation: source.rotation,
          });
          outputPage.drawPage(embedded, {
            x: draw.x,
            y: draw.y,
            xScale: draw.xScale,
            yScale: draw.yScale,
            rotate: pdfLib.degrees(draw.degrees),
          });
        }
      }
      const bytes = await output.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 50,
      });
      if (bytes.byteLength > 100_000_000)
        throw new Error(
          "The generated PDF exceeds the 100 MB output limit. Try a simpler source PDF.",
        );
      return { bytes, filename };
    },
  };
};
