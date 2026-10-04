export interface Layout {
  readonly custom?: boolean;
  readonly copies: number;
  readonly columns: number;
  readonly rows: number;
}

export type PaperMode = "expand" | "same" | "a4" | "a3" | "custom";

export type OutputAction = "open" | "save";

export interface PdfOutput {
  blob: Blob;
  url: string;
  filename: string;
  size: number;
}

export interface ConversionOptions {
  layout: Layout;
  paperMode: PaperMode;
  marginMm?: number;
  gutterMm?: number;
  scaleMode?: "fit" | "percent" | "dimensions";
  scalePercent?: number;
  copyWidthMm?: number;
  copyHeightMm?: number;
  cropMarks?: boolean;
  paperWidthMm?: number;
  paperHeightMm?: number;
}

export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisiblePageGeometry {
  cropBox: PageBox;
  rotation: number;
  userUnit: number;
  width: number;
  height: number;
}

export interface FileMetadata {
  name: string;
  size: number;
}

export interface SourceMetadata extends VisiblePageGeometry, FileMetadata {
  warnings: string[];
  pageCount: number;
  pageNumber: number;
}

export interface ConversionResult {
  bytes: Uint8Array<ArrayBuffer>;
  filename: string;
}

export interface LoadPayload {
  bytes: Uint8Array<ArrayBuffer>;
  metadata: FileMetadata;
}

export type WorkerRequest =
  | { id: number; method: "selectPage"; payload: number }
  | { id: number; method: "load"; payload: LoadPayload }
  | { id: number; method: "generate"; payload: ConversionOptions };

export type WorkerResponse =
  | { id: number; result: SourceMetadata | ConversionResult }
  | { id: number; error: string };
