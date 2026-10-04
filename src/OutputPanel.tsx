import { useState } from "react";
import { formatBytes } from "./format.ts";
import styles from "./OutputPanel.module.css";
import { Preview } from "./Preview.tsx";
import { PrintSummary } from "./PrintSummary.tsx";
import type { OutputAction, PdfOutput } from "./types.ts";
import ui from "./ui.module.css";

interface OutputPanelProps {
  output: PdfOutput | null;
  active: boolean;
  openOutput: (action: OutputAction) => Promise<void>;
}
export function OutputPanel({ output, active, openOutput }: OutputPanelProps) {
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [selection, setSelection] = useState<{ url?: string; page: number }>({
    page: 1,
  });
  const pageCount = output?.sheets?.length ?? 1;
  const pageNumber =
    selection.url === output?.url ? Math.min(selection.page, pageCount) : 1;
  const setPageNumber = (page: number) =>
    setSelection({ url: output?.url, page });
  const nativeViewer = navigator.pdfViewerEnabled === true;
  return (
    <article
      className={`${ui.panel} ${styles.outputPanel} ${output ? styles.hasOutput : ""}`}
      id="outputPanel"
    >
      <div className={`${styles.panelHeader} ${styles.outputHeader}`}>
        <div
          className={styles.outputCopy}
          title={
            output
              ? `${output.filename} / ${formatBytes(output.size)}`
              : undefined
          }
        >
          {output?.sheets?.length ? (
            <PrintSummary sheets={output.sheets} />
          ) : (
            <>
              <h2 className={styles.panelTitle}>
                {output ? "Your PDF" : "Output preview"}
              </h2>
              <p className={styles.panelSubtitle} id="outputSummary">
                {output
                  ? `${output.filename} / ${formatBytes(output.size)}`
                  : "Choose a PDF above to get started."}
              </p>
            </>
          )}
        </div>
        <div className={styles.outputActions}>
          {pageCount > 1 && (!nativeViewer || showMeasurements) && (
            <nav className={styles.outputActions} aria-label="Output sheets">
              <button
                type="button"
                className={`${ui.button} ${ui.compact}`}
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber(pageNumber - 1)}
                aria-label="Previous sheet"
              >
                Previous
              </button>
              <span className={styles.panelSubtitle}>
                Sheet {pageNumber} / {pageCount}
              </span>
              <button
                type="button"
                className={`${ui.button} ${ui.compact}`}
                disabled={pageNumber >= pageCount}
                onClick={() => setPageNumber(pageNumber + 1)}
                aria-label="Next sheet"
              >
                Next
              </button>
            </nav>
          )}
          {output?.measurements && (
            <label
              className={ui.checkbox}
              title="Show measurements on the preview only"
            >
              <input
                type="checkbox"
                checked={showMeasurements}
                onChange={(event) => setShowMeasurements(event.target.checked)}
              />
              Measurements
            </label>
          )}

          <button
            className={`${ui.button} ${ui.compact}`}
            id="openOutputButton"
            type="button"
            disabled={!output}
            onClick={() => void openOutput("open")}
          >
            Open in tab ↗
          </button>
          <button
            className={`${ui.button} ${ui.primary} ${ui.compact}`}
            id="downloadOutputButton"
            disabled={!output}
            onClick={() => void openOutput("save")}
            type="button"
          >
            Save PDF
          </button>
        </div>
      </div>
      <Preview
        output={output}
        active={active}
        nativeViewer={nativeViewer}
        showMeasurements={showMeasurements}
        pageNumber={pageNumber}
      />
      <p className={styles.previewNote}>
        {nativeViewer && !showMeasurements
          ? "Save or print using the PDF toolbar. "
          : "Preview only: images above 16 megapixels may be omitted. Open the PDF to check before printing. "}
        <strong>Print at 100% / actual size.</strong> Match the paper size above
        and turn off any extra pages-per-sheet setting in your print dialogue.
      </p>
    </article>
  );
}
