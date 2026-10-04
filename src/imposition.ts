import {
  getOutputGeometry,
  getSpacing,
  linkCopyDimensions,
} from "./geometry.ts";
import type { ConversionOptions, Layout, PageBox } from "./types.ts";

export const MAX_SELECTED_PAGES = 10_000;
export const MAX_OUTPUT_SHEETS = 1_000;

export function parsePageRange(range: string, pageCount: number): number[] {
  if (!Number.isInteger(pageCount) || pageCount < 1)
    throw new Error("The PDF contains no pages.");
  const text = range.trim();
  if (!text) {
    if (pageCount > MAX_SELECTED_PAGES)
      throw new Error("Select at most 10,000 pages using a page range.");
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  if (text.length > 60_000) throw new Error("The page range is too long.");
  const pages: number[] = [];
  for (const part of text.split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match)
      throw new Error("Use page numbers and ranges, for example 1-4, 7, 9-12.");
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    if (
      first < 1 ||
      last < first ||
      last > pageCount ||
      !Number.isSafeInteger(last)
    )
      throw new Error(`Choose ascending ranges within pages 1-${pageCount}.`);
    if (pages.length + last - first + 1 > MAX_SELECTED_PAGES)
      throw new Error("Select at most 10,000 pages.");
    for (let page = first; page <= last; page++) pages.push(page);
  }
  return pages;
}

export function getCellBoxes(
  output: { outputWidth: number; outputHeight: number; layout: Layout },
  options: ConversionOptions,
): PageBox[] {
  const { edges } = getSpacing(options);
  const { columns, rows, copies } = output.layout;
  const width =
    (output.outputWidth -
      edges.left -
      edges.right -
      (columns - 1) * edges.horizontal) /
    columns;
  const height =
    (output.outputHeight -
      edges.top -
      edges.bottom -
      (rows - 1) * edges.vertical) /
    rows;
  return Array.from({ length: copies }, (_, index) => {
    const column =
      options.pageOrder === "columns"
        ? Math.floor(index / rows)
        : index % columns;
    const row =
      options.pageOrder === "columns"
        ? index % rows
        : Math.floor(index / columns);
    return {
      x: edges.left + column * (width + edges.horizontal),
      y: edges.bottom + (rows - 1 - row) * (height + edges.vertical),
      width,
      height,
    };
  });
}

export function fitPageToCell(
  source: { width: number; height: number },
  cell: PageBox,
  options: ConversionOptions,
  rotation: number,
) {
  const rotated = rotation === 90;
  const width = rotated ? source.height : source.width;
  const height = rotated ? source.width : source.height;
  const maximum = Math.min(cell.width / width, cell.height / height);
  const sizing =
    options.scaleMode === "dimensions"
      ? {
          ...options,
          ...linkCopyDimensions(source, {
            copyWidthMm: options.copyWidthMm ?? 90,
          }),
        }
      : options;
  const scale =
    (!options.scaleMode || options.scaleMode === "fit") && !options.autoLayout
      ? maximum
      : getOutputGeometry({
          ...source,
          ...sizing,
          autoLayout: false,
          rotateCopies: false,
          paperMode: "expand",
          layout: { custom: true, rows: 1, columns: 1, copies: 1 },
        }).scale;
  if (scale > maximum + 1e-9)
    throw new Error(
      `Page does not fit its cell at the requested size. Maximum scale is ${(maximum * 100).toFixed(2)}%. Use automatic copy sizing, fewer copies or larger paper.`,
    );
  return {
    scale,
    box: {
      x: cell.x + (cell.width - width * scale) / 2,
      y: cell.y + (cell.height - height * scale) / 2,
      width: width * scale,
      height: height * scale,
    },
  };
}

export function getRepeatCount(
  quantity: number | undefined,
  capacity: number,
  fillLastSheet = false,
) {
  if (quantity === undefined) return capacity;
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_SELECTED_PAGES
  )
    throw new Error("Quantity must be a whole number from 1 to 10,000.");
  return fillLastSheet ? Math.ceil(quantity / capacity) * capacity : quantity;
}
