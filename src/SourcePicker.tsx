import { useRef } from "react";
import { formatBytes, formatPageSize } from "./format.ts";
import styles from "./SourcePicker.module.css";
import type { SourceMetadata } from "./types.ts";
import ui from "./ui.module.css";

interface SourcePickerProps {
  compact?: boolean;
  source: SourceMetadata | null;
  processing: boolean;
  dragging: boolean;
  onSelectFiles: (files: File[]) => Promise<void>;
  onClear: () => void;
}
export function SourcePicker({
  compact = false,
  source,
  processing,
  dragging,
  onSelectFiles,
  onClear,
}: SourcePickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clearDocument = () => {
    onClear();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  return (
    <section
      className={`${styles.sourceBar} ${dragging ? styles.dragging : ""} ${source ? styles.hasFile : ""} ${compact ? styles.compact : ""}`}
      id="dropZone"
      aria-label="Source PDF"
    >
      <input
        id="fileInput"
        ref={fileInputRef}
        disabled={processing}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void onSelectFiles(files);
        }}
        multiple
        type="file"
        accept="application/pdf,.pdf"
        hidden
      />
      <div className={styles.fileSymbol} aria-hidden="true">
        PDF
      </div>
      <div className={styles.sourceCopy}>
        <h2 id="dropTitle" title={source?.name}>
          {source?.name ?? "Drop one or more PDFs anywhere"}
        </h2>
        <p id="dropDescription">
          {source
            ? `${formatBytes(source.size)} · ${formatPageSize(source.width, source.height)} · page ${source.pageNumber} of ${source.pageCount}`
            : "Drop multiple PDFs to batch convert. Up to 20 files, 50 MB per file, 100 MB total."}
        </p>
      </div>
      <div className={styles.documentActions}>
        <button
          className={`${ui.button} ${source ? ui.compact : ui.primary}`}
          id="selectFileButton"
          disabled={processing}
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          {source ? "Replace PDF" : "Choose PDFs"}
        </button>
        {source && !processing && (
          <button
            className={`${ui.button} ${ui.compact} ${ui.quiet}`}
            id="clearDocumentButton"
            type="button"
            onClick={clearDocument}
          >
            Clear
          </button>
        )}
        {processing && (
          <button
            className={`${ui.button} ${ui.compact}`}
            id="cancelButton"
            onClick={clearDocument}
            type="button"
          >
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}
