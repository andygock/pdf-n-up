import type {
  ConversionOptions,
  Layout,
  PageBox,
  VisiblePageGeometry,
} from "./types.ts";

// Pure layout and page-geometry helpers. Keeping these functions independent
// from DOM and application state makes the PDF calculations easy to test.
export const LAYOUTS = Object.freeze({
  2: Object.freeze({ copies: 2, columns: 2, rows: 1 }),
  4: Object.freeze({ copies: 4, columns: 2, rows: 2 }),
  8: Object.freeze({ copies: 8, columns: 4, rows: 2 }),
  9: Object.freeze({ copies: 9, columns: 3, rows: 3 }),
  16: Object.freeze({ copies: 16, columns: 4, rows: 4 }),
});

export const MAX_PDF_PAGE_DIMENSION = 14_400;

const normaliseRotation = (angle: number) => ((angle % 360) + 360) % 360;

export const getVisiblePageGeometry = (
  cropBox: PageBox,
  rotationAngle = 0,
  mediaBox = cropBox,
  userUnit = 1,
): VisiblePageGeometry => {
  const rotation = normaliseRotation(rotationAngle);

  if (![0, 90, 180, 270].includes(rotation)) {
    throw new Error(`Unsupported PDF page rotation: ${rotationAngle} degrees.`);
  }

  for (const box of [cropBox, mediaBox]) {
    if (
      !box ||
      ![
        box.x,
        box.y,
        box.width,
        box.height,
        box.x + box.width,
        box.y + box.height,
      ].every(Number.isFinite) ||
      box.width <= 0 ||
      box.height <= 0
    ) {
      throw new Error("The PDF page has an invalid visible area.");
    }
  }
  if (!Number.isFinite(userUnit) || userUnit <= 0 || userUnit > 75_000) {
    throw new Error("The PDF page has an invalid UserUnit scale.");
  }

  // Page boxes use default user-space units. Clip there first, then convert
  // physical dimensions to points; keep the clipped box for page embedding.
  const x = Math.max(cropBox.x, mediaBox.x);
  const y = Math.max(cropBox.y, mediaBox.y);
  const width =
    Math.min(cropBox.x + cropBox.width, mediaBox.x + mediaBox.width) - x;
  const height =
    Math.min(cropBox.y + cropBox.height, mediaBox.y + mediaBox.height) - y;
  if (width <= 0 || height <= 0) {
    throw new Error("The PDF CropBox does not overlap its MediaBox.");
  }

  const swapsAxes = rotation === 90 || rotation === 270;
  if (![width * userUnit, height * userUnit].every(Number.isFinite)) {
    throw new Error("The PDF page has invalid physical dimensions.");
  }

  return {
    cropBox: { x, y, width, height },
    rotation,
    userUnit,
    width: (swapsAxes ? height : width) * userUnit,
    height: (swapsAxes ? width : height) * userUnit,
  };
};

export const getResolvedLayout = (
  layout: Layout,
  width: number,
  height: number,
): Layout =>
  width > height && !layout.custom
    ? { copies: layout.copies, columns: layout.rows, rows: layout.columns }
    : { ...layout };

export const getOutputGeometry = ({
  width,
  height,
  layout,
  paperMode,
  marginMm = 0,
  gutterMm = 0,
  cropMarks = false,
  scaleMode = "fit",
  scalePercent = 100,
  copyWidthMm = 90,
  copyHeightMm = 50,
  paperWidthMm = 210,
  paperHeightMm = 297,
}: ConversionOptions & { width: number; height: number }) => {
  if (
    ![width, height].every((value) => Number.isFinite(value) && value > 0) ||
    !layout ||
    ![layout.columns, layout.rows].every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 20,
    ) ||
    layout.copies !== layout.columns * layout.rows ||
    layout.copies > 100 ||
    !["expand", "same", "a4", "a3", "custom"].includes(paperMode)
  ) {
    throw new Error("Invalid page dimensions or layout options.");
  }
  if (
    ![marginMm, gutterMm].every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 100,
    )
  ) {
    throw new Error("Margins and gutters must be between 0 and 100 mm.");
  }
  const { margin, gutter } = getSpacing({ marginMm, gutterMm, cropMarks });
  const { columns, rows } = getResolvedLayout(layout, width, height);

  if (!["fit", "percent", "dimensions"].includes(scaleMode))
    throw new Error("Invalid copy sizing mode.");
  let requestedScale: number | undefined;
  if (scaleMode === "percent") {
    if (
      !Number.isFinite(scalePercent) ||
      scalePercent <= 0 ||
      scalePercent > 10000
    )
      throw new Error(
        "Copy scale must be greater than zero and at most 10,000%.",
      );
    requestedScale = scalePercent / 100;
  } else if (scaleMode === "dimensions") {
    if (
      ![copyWidthMm, copyHeightMm].every(
        (value) => Number.isFinite(value) && value > 0 && value <= 5080,
      )
    )
      throw new Error(
        "Copy dimensions must be greater than zero and at most 5,080 mm.",
      );
    requestedScale = (copyWidthMm * 72) / 25.4 / width;
    if (Math.abs((height * requestedScale * 25.4) / 72 - copyHeightMm) > 0.1)
      throw new Error(
        "Copy dimensions must match the source proportions (within 0.1 mm). Adjust width or height to avoid distortion.",
      );
  }
  if (paperMode === "expand") {
    return {
      outputWidth:
        width * (requestedScale ?? 1) * columns +
        2 * margin +
        (columns - 1) * gutter,
      outputHeight:
        height * (requestedScale ?? 1) * rows +
        2 * margin +
        (rows - 1) * gutter,
      scale: requestedScale ?? 1,
    };
  }

  const paper =
    paperMode === "a4"
      ? [210, 297]
      : paperMode === "a3"
        ? [297, 420]
        : [paperWidthMm, paperHeightMm];
  if (
    paperMode === "custom" &&
    !paper.every(
      (value) => Number.isFinite(value) && value > 0 && value <= 5080,
    )
  )
    throw new Error(
      "Custom paper dimensions must be greater than zero and at most 5,080 mm.",
    );
  const sheetWidth = paperMode === "same" ? width : (paper[0] * 72) / 25.4;
  const sheetHeight = paperMode === "same" ? height : (paper[1] * 72) / 25.4;
  const orientations = [
    { outputWidth: sheetWidth, outputHeight: sheetHeight },
    { outputWidth: sheetHeight, outputHeight: sheetWidth },
  ];

  const candidates = orientations.map((orientation) => ({
    ...orientation,
    scale: Math.min(
      (orientation.outputWidth - 2 * margin - (columns - 1) * gutter) /
        columns /
        width,
      (orientation.outputHeight - 2 * margin - (rows - 1) * gutter) /
        rows /
        height,
    ),
  }));

  const best = candidates.reduce((best, candidate) =>
    candidate.scale > best.scale ? candidate : best,
  );
  if (best.scale <= 0)
    throw new Error(
      "Margins and gutters leave no space for copies. Reduce the spacing or expand the paper.",
    );
  if (requestedScale !== undefined) {
    if (requestedScale > best.scale + 1e-9)
      throw new Error(
        `Copies at the requested size do not fit. Maximum scale is ${(best.scale * 100).toFixed(2)}%. Choose larger paper, fewer copies or less spacing.`,
      );
    return { ...best, scale: requestedScale };
  }
  return best;
};

export const assertCompatibleOutputSize = ({
  outputWidth,
  outputHeight,
}: {
  outputWidth: number;
  outputHeight: number;
}) => {
  if (
    ![outputWidth, outputHeight].every(
      (value) =>
        Number.isFinite(value) && value > 0 && value <= MAX_PDF_PAGE_DIMENSION,
    )
  ) {
    throw new Error(
      "The output sheet exceeds the supported 5,080 mm PDF page limit. Choose source-page size, reduce spacing or use a smaller source page.",
    );
  }
};

// pdf-lib draws positive angles counter-clockwise, while a PDF page's /Rotate
// value describes clockwise display rotation. The translated origins below
// keep every rotated page's visible lower-left corner at (left, bottom).
export const getRotatedDrawOptions = ({
  left,
  bottom,
  sourceWidth,
  sourceHeight,
  scale,
  rotation,
}: {
  left: number;
  bottom: number;
  sourceWidth: number;
  sourceHeight: number;
  scale: number;
  rotation: number;
}) => {
  switch (normaliseRotation(rotation)) {
    case 0:
      return { x: left, y: bottom, xScale: scale, yScale: scale, degrees: 0 };
    case 90:
      return {
        x: left,
        y: bottom + sourceWidth * scale,
        xScale: scale,
        yScale: scale,
        degrees: -90,
      };
    case 180:
      return {
        x: left + sourceWidth * scale,
        y: bottom + sourceHeight * scale,
        xScale: scale,
        yScale: scale,
        degrees: -180,
      };
    case 270:
      return {
        x: left + sourceHeight * scale,
        y: bottom,
        xScale: scale,
        yScale: scale,
        degrees: -270,
      };
    default:
      throw new Error(`Unsupported PDF page rotation: ${rotation} degrees.`);
  }
};

export const makeOutputFilename = (inputName: string, copies: number) => {
  const cleanedName = inputName.trim() || "document.pdf";
  const lastDot = cleanedName.lastIndexOf(".");
  const hasPdfExtension =
    lastDot > 0 && cleanedName.slice(lastDot).toLowerCase() === ".pdf";
  const basename = hasPdfExtension
    ? cleanedName.slice(0, lastDot)
    : cleanedName;

  return `${basename}_${copies}up.pdf`;
};

// Reserve 1 mm clearance plus 3 mm marks, with spare room at sheet edges.
export const getSpacing = (
  options: Pick<ConversionOptions, "marginMm" | "gutterMm" | "cropMarks">,
) => ({
  margin:
    (Math.max(options.marginMm ?? 0, options.cropMarks ? 5 : 0) * 72) / 25.4,
  gutter:
    (Math.max(options.gutterMm ?? 0, options.cropMarks ? 10 : 0) * 72) / 25.4,
});

export const getCopyBoxes = (
  options: ConversionOptions & { width: number; height: number },
) => {
  const geometry = getOutputGeometry(options);
  const { columns, rows, copies } = getResolvedLayout(
    options.layout,
    options.width,
    options.height,
  );
  const { margin, gutter } = getSpacing(options);
  const cellWidth =
    (geometry.outputWidth - 2 * margin - (columns - 1) * gutter) / columns;
  const cellHeight =
    (geometry.outputHeight - 2 * margin - (rows - 1) * gutter) / rows;
  const width = options.width * geometry.scale;
  const height = options.height * geometry.scale;
  return Array.from({ length: copies }, (_, index) => ({
    x:
      margin +
      (index % columns) * (cellWidth + gutter) +
      (cellWidth - width) / 2,
    y:
      margin +
      (rows - 1 - Math.floor(index / columns)) * (cellHeight + gutter) +
      (cellHeight - height) / 2,
    width,
    height,
  }));
};

export const getCropMarkLines = (box: PageBox) => {
  const clearance = 72 / 25.4;
  const reach = 4 * clearance;
  return [box.x, box.x + box.width].flatMap((x) =>
    [box.y, box.y + box.height].flatMap((y) => {
      const dx = x === box.x ? -1 : 1;
      const dy = y === box.y ? -1 : 1;
      return [
        { start: { x: x + dx * clearance, y }, end: { x: x + dx * reach, y } },
        { start: { x, y: y + dy * clearance }, end: { x, y: y + dy * reach } },
      ];
    }),
  );
};
