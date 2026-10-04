import type * as PDFLib from "pdf-lib";
import type { PDFDocument, PDFPage } from "pdf-lib";
import {
  assertCompatibleOutputSize,
  getCopyBoxes,
  getCropMarkLines,
  getOutputGeometry,
  getRotatedDrawOptions,
  getSpacing,
  getVisiblePageGeometry,
  linkCopyDimensions,
  makeOutputFilename,
} from "./geometry.ts";
import {
  fitPageToCell,
  getCellBoxes,
  MAX_OUTPUT_SHEETS,
  parsePageRange,
} from "./imposition.ts";
import type {
  ConversionOptions,
  ConversionResult,
  FileMetadata,
  OutputSheet,
  SourceMetadata,
} from "./types.ts";

// The browser runs this engine only inside a terminable worker. Accepting the
// library explicitly also lets Node tests exercise the same PDF pipeline.
export const createConversionEngine = (pdfLib: typeof PDFLib) => {
  let source:
    | (SourceMetadata & { page: PDFPage; document: PDFDocument })
    | null = null;

  const selectPage = (
    document: PDFDocument,
    { name, size }: FileMetadata,
    pageNumber: number,
    retain = true,
  ): SourceMetadata => {
    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > document.getPageCount()
    )
      throw new Error("Choose a page number within the document.");
    const page = document.getPage(pageNumber - 1);
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
    const warnings: string[] = [];
    if (
      page.node.Annots()?.size() ||
      document.catalog.has(pdfLib.PDFName.of("AcroForm"))
    ) {
      warnings.push(
        "This PDF contains annotations or form fields. Their appearances, values and links are not copied; flatten them in a PDF editor first if they must appear in print.",
      );
    }
    const metadata = {
      name,
      size,
      pageCount: document.getPageCount(),
      pageNumber,
      ...geometry,
      warnings,
    };
    // Output compatibility belongs to generate(), so changing paper mode can
    // recover from an oversized layout without selecting the source again.
    if (retain) source = { page, document, ...metadata };
    return metadata;
  };

  return {
    async load(
      bytes: Uint8Array,
      { name, size }: FileMetadata,
    ): Promise<SourceMetadata> {
      source = null;
      let document: PDFDocument;
      let pageCount: number;
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
          /encrypt|password/i.test(
            error instanceof Error ? error.message : String(error),
          )
            ? "Password-protected or encrypted PDFs are not supported."
            : "The PDF could not be parsed. It may be damaged or unsupported.",
          { cause: error },
        );
      }
      if (!pageCount) throw new Error("The PDF contains no pages.");
      return selectPage(document, { name, size }, 1);
    },

    selectPage(pageNumber: number): SourceMetadata {
      if (!source) throw new Error("Select a PDF before choosing a page.");
      return selectPage(source.document, source, pageNumber);
    },

    async generate(options: ConversionOptions): Promise<ConversionResult> {
      if (!source) throw new Error("Select a PDF before converting.");
      const original = source;
      if (
        options.mode !== undefined &&
        !["repeat", "sequence"].includes(options.mode)
      )
        throw new Error("Invalid page arrangement mode.");
      if (
        options.pageOrder !== undefined &&
        !["rows", "columns"].includes(options.pageOrder)
      )
        throw new Error("Invalid page order.");
      const sequence = options.mode === "sequence";
      const selectedPages = sequence
        ? parsePageRange(options.pageRange ?? "", original.pageCount)
        : [original.pageNumber];
      const reference = sequence
        ? selectPage(original.document, original, selectedPages[0], false)
        : original;
      const layoutOptions =
        sequence && options.scaleMode === "dimensions"
          ? {
              ...options,
              ...linkCopyDimensions(reference, {
                copyWidthMm: options.copyWidthMm ?? 90,
              }),
            }
          : options;
      const geometry = getOutputGeometry({ ...reference, ...layoutOptions });
      const { outputWidth, outputHeight, scale, layout, rotation } = geometry;
      assertCompatibleOutputSize(geometry);
      const { copies } = layout;
      const pageNumbers = sequence
        ? selectedPages
        : Array.from({ length: copies }, () => original.pageNumber);
      if (Math.ceil(pageNumbers.length / copies) > MAX_OUTPUT_SHEETS)
        throw new Error(
          "Output is limited to 1,000 sheets. Select fewer pages or more copies per sheet.",
        );
      const filename = makeOutputFilename(
        sequence
          ? `${original.name.replace(/\.pdf$/i, "")}_pages.pdf`
          : original.pageCount > 1
            ? `${original.name.replace(/\.pdf$/i, "")}_page${original.pageNumber}.pdf`
            : original.name,
        copies,
      );
      const output = await pdfLib.PDFDocument.create();
      output.setTitle(filename.replace(/\.pdf$/i, ""));
      output.setSubject(`${copies}-up PDF layout`);
      output.setCreator("PDF N-up browser application");
      output.setProducer("pdf-lib");
      const sheets: OutputSheet[] = [];
      const warnings = new Set<string>();
      const cells = getCellBoxes(geometry, options);
      const repeatBoxes = sequence
        ? []
        : getCopyBoxes({ ...reference, ...layoutOptions });
      const embeddedPages = new Map<number, PDFLib.PDFEmbeddedPage | null>();
      const pageInfo = new Map<number, SourceMetadata>();
      for (let offset = 0; offset < pageNumbers.length; offset += copies) {
        const outputPage = output.addPage([outputWidth, outputHeight]);
        const sheet: OutputSheet = {
          outputWidth,
          outputHeight,
          ...getSpacing(options),
          boxes: [],
          scales: [],
          sourcePages: [],
          capacity: copies,
        };
        for (
          let slot = 0;
          slot < copies && offset + slot < pageNumbers.length;
          slot++
        ) {
          const pageNumber = pageNumbers[offset + slot];
          let metadata = pageInfo.get(pageNumber);
          if (!metadata) {
            metadata = selectPage(
              original.document,
              original,
              pageNumber,
              false,
            );
            pageInfo.set(pageNumber, metadata);
          }
          for (const warning of metadata.warnings) warnings.add(warning);
          let placement: ReturnType<typeof fitPageToCell>;
          try {
            placement = sequence
              ? fitPageToCell(metadata, cells[slot], options, rotation)
              : { scale, box: repeatBoxes[slot] };
          } catch (error) {
            throw new Error(
              `Source page ${pageNumber}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
          const page = original.document.getPage(pageNumber - 1);
          const { x, y, width, height } = metadata.cropBox;
          if (!embeddedPages.has(pageNumber)) {
            // Missing /Contents is valid for a blank PDF page. Avoid asking pdf-lib
            // to embed it: there is no visual content to repeat.
            const contents = page.node.Contents();
            const blank =
              !contents ||
              (contents instanceof pdfLib.PDFArray && contents.size() === 0);
            let embedded: PDFLib.PDFEmbeddedPage | null = null;
            if (!blank) {
              embedded = await output.embedPage(page, {
                left: x,
                bottom: y,
                right: x + width,
                top: y + height,
              });
              const group = page.node.get(pdfLib.PDFName.of("Group"));
              if (group) {
                // pdf-lib omits page transparency groups when creating Form XObjects.
                // Materialise the form before restoring the group, copying indirect
                // colour-space references into the destination document as well.
                await embedded.embed();
                const form = output.context.lookup(
                  embedded.ref,
                  pdfLib.PDFStream,
                );
                form.dict.set(
                  pdfLib.PDFName.of("Group"),
                  pdfLib.PDFObjectCopier.for(
                    original.document.context,
                    output.context,
                  ).copy(group),
                );
              }
            }
            embeddedPages.set(pageNumber, embedded);
          }
          const embedded = embeddedPages.get(pageNumber);
          if (embedded) {
            const draw = getRotatedDrawOptions({
              left: placement.box.x,
              bottom: placement.box.y,
              sourceWidth: width,
              sourceHeight: height,
              // Embedded streams retain source units; output pages use points.
              scale: placement.scale * metadata.userUnit,
              rotation: metadata.rotation + rotation,
            });
            outputPage.drawPage(embedded, {
              x: draw.x,
              y: draw.y,
              xScale: draw.xScale,
              yScale: draw.yScale,
              rotate: pdfLib.degrees(draw.degrees),
            });
          }
          if (options.cropMarks) {
            for (const line of getCropMarkLines(placement.box))
              outputPage.drawLine({
                ...line,
                thickness: 0.25,
                color: pdfLib.rgb(0, 0, 0),
              });
          }
          sheet.boxes.push(placement.box);
          sheet.scales.push(placement.scale);
          sheet.sourcePages.push(pageNumber);
        }
        sheets.push(sheet);
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
      // pdf-lib serialises into an ordinary ArrayBuffer; its declarations predate
      // TypeScript''s distinction between ordinary and shared typed-array buffers.
      return {
        bytes: bytes as Uint8Array<ArrayBuffer>,
        filename,
        sheets,
        warnings: [...warnings],
      };
    },
  };
};
