import { useId, useState } from "react";
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
  const modeName = useId();
  const [showRuler, setShowRuler] = useState(false);
  const [rulerFooter, setRulerFooter] = useState<HTMLDivElement | null>(null);
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
                  : "Choose a PDF or image above to get started."}
              </p>
            </>
          )}
        </div>
        <div className={styles.outputActions}>
          {pageCount > 1 && (!nativeViewer || showRuler) && (
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
                Sheet{" "}
                <input
                  className={styles.sheetNumber}
                  aria-label="Go to sheet"
                  type="number"
                  min={1}
                  max={pageCount}
                  step={1}
                  value={pageNumber}
                  onChange={(event) => {
                    const page = Number(event.currentTarget.value);
                    if (
                      Number.isInteger(page) &&
                      page >= 1 &&
                      page <= pageCount
                    )
                      setPageNumber(page);
                  }}
                />{" "}
                / {pageCount}
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
          <fieldset className={styles.modeSwitch} aria-label="Preview mode">
            {[false, true].map((rulerMode) => (
              <label
                className={styles.modeChoice}
                key={String(rulerMode)}
                title={
                  rulerMode
                    ? "Measure the sheet with rulers and a draggable origin"
                    : "View the generated PDF for saving and printing"
                }
              >
                <input
                  type="radio"
                  name={modeName}
                  checked={showRuler === rulerMode}
                  disabled={!output}
                  onChange={() => setShowRuler(rulerMode)}
                />
                <span>{rulerMode ? "Ruler mode" : "PDF output"}</span>
              </label>
            ))}
          </fieldset>
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
        showMeasurements={showRuler}
        showRuler={showRuler}
        pageNumber={pageNumber}
        rulerFooter={rulerFooter}
      />
      <footer className={styles.previewNote}>
        <div
          ref={setRulerFooter}
          className={styles.rulerFooter}
          hidden={!showRuler}
        />
        <span title="Match the paper size above and turn off any extra pages-per-sheet setting in your print dialogue.">
          {!showRuler &&
            (nativeViewer
              ? "Save or print using the PDF toolbar. "
              : "Preview only: images above 16 megapixels may be omitted. Open the PDF to check before printing. ")}
          <strong>Print at 100% / actual size.</strong>
          {!showRuler &&
            " Match the paper size above and turn off any extra pages-per-sheet setting in your print dialogue."}
        </span>
      </footer>
    </article>
  );
}
