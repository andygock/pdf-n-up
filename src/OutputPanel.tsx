import { formatBytes } from "./format.ts";
import styles from "./OutputPanel.module.css";
import { Preview } from "./Preview.tsx";
import ui from "./ui.module.css";
import type { Output } from "./useConversion.ts";

interface OutputPanelProps {
  output: Output | null;
  active: boolean;
  openOutput: (download: boolean) => Promise<void>;
}
export function OutputPanel({ output, active, openOutput }: OutputPanelProps) {
  const nativeViewer = navigator.pdfViewerEnabled === true;
  return (
    <article
      className={`${ui.panel} ${styles.outputPanel} ${output ? styles.hasOutput : ""}`}
      id="outputPanel"
    >
      <div className={`${styles.panelHeader} ${styles.outputHeader}`}>
        <div className={styles.outputCopy}>
          <h2 className={styles.panelTitle}>
            {output ? "Your PDF" : "Output preview"}
          </h2>
          <p className={styles.panelSubtitle} id="outputSummary">
            {output
              ? `${output.filename} · ${formatBytes(output.size)}`
              : "Choose a PDF above to get started."}
          </p>
        </div>
        <div className={styles.outputActions}>
          <button
            className={`${ui.button} ${ui.compact}`}
            id="openOutputButton"
            type="button"
            disabled={!output}
            onClick={() => void openOutput(false)}
          >
            Open in tab ↗
          </button>
          <button
            className={`${ui.button} ${ui.primary} ${ui.compact}`}
            id="downloadOutputButton"
            disabled={!output}
            onClick={() => void openOutput(true)}
            type="button"
          >
            Save PDF
          </button>
        </div>
      </div>
      <Preview output={output} active={active} nativeViewer={nativeViewer} />
      <p className={styles.previewNote}>
        {nativeViewer
          ? "Save or print using the PDF toolbar. "
          : "Preview only: images above 16 megapixels may be omitted. Open the PDF to check before printing. "}
        Print at actual size to keep these dimensions.
      </p>
    </article>
  );
}
