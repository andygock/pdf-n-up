import styles from "./ConversionFeedback.module.css";
import { formatBytes, formatPageSize } from "./format.ts";
import { Modal } from "./Modal.tsx";
import { PrintWarningButton } from "./PrintWarningButton.tsx";
import { printWarnings } from "./print-warnings.ts";
import ui from "./ui.module.css";
import type { useConversion } from "./useConversion.ts";

type ConversionFeedbackProps = Pick<
  ReturnType<typeof useConversion>,
  | "recovery"
  | "source"
  | "output"
  | "options"
  | "processing"
  | "status"
  | "failed"
  | "details"
  | "changeOptions"
>;
export function ConversionFeedback({
  recovery,
  source,
  output,
  options,
  processing,
  status,
  failed,
  details,
  changeOptions,
}: ConversionFeedbackProps) {
  const sequenceFitFailure =
    failed &&
    options.mode === "sequence" &&
    /requested size do not fit|does not fit its cell at the requested size/.test(
      status.message,
    );
  const warnings =
    output && source ? printWarnings(output.sheets ?? [], source.name) : [];
  return (
    <>
      {(source || processing || status.type === "error") && (
        <div className={styles.feedbackRow}>
          <div
            className={`${styles.statusBox} ${status.type ? (styles[status.type] ?? "") : ""}`}
            id="statusBox"
            role="status"
            aria-live="polite"
          >
            <span className={styles.statusSymbol} aria-hidden="true">
              {status.loading ? (
                <span className={styles.spinner} />
              ) : (
                (status.symbol ?? "i")
              )}
            </span>
            <div>
              <strong id="statusTitle">{status.title}</strong>
              <span className={styles.statusMessage} id="statusMessage">
                {output &&
                status.type === "success" &&
                status.title === "Output ready"
                  ? `${details.layout} · ${details.outputSize} · ${details.scale} scale`
                  : status.message}
              </span>
            </div>
            {processing && (
              <div className={styles.progressTrack}>
                <div className={styles.progressBar} />
              </div>
            )}
          </div>
          {recovery && (
            <>
              <button
                className={`${ui.button} ${ui.compact}`}
                type="button"
                disabled={processing}
                onClick={() => void changeOptions(recovery.fit)}
              >
                Use maximum fitting scale (
                {Number(recovery.maximumScale.toFixed(2))}%)
              </button>
              {recovery.fewer && (
                <button
                  className={`${ui.button} ${ui.compact}`}
                  type="button"
                  disabled={processing}
                  onClick={() => {
                    if (recovery.fewer) void changeOptions(recovery.fewer);
                  }}
                >
                  Reduce to {recovery.fewer.layout.copies} copies per sheet
                </button>
              )}
            </>
          )}
          {sequenceFitFailure && (
            <button
              className={`${ui.button} ${ui.compact}`}
              type="button"
              disabled={processing}
              onClick={() =>
                void changeOptions({ autoLayout: false, scaleMode: "fit" })
              }
            >
              Fit each page to its cell
            </button>
          )}
          {failed &&
            !recovery &&
            !sequenceFitFailure &&
            source &&
            options.paperMode !== "same" && (
              <button
                className={`${ui.button} ${ui.compact}`}
                id="useSourceSizeButton"
                disabled={processing}
                onClick={() => void changeOptions({ paperMode: "same" })}
                type="button"
              >
                Use source-page size
              </button>
            )}
          <div className={styles.detailsActions}>
            {warnings.length > 0 && (
              <Modal
                title="Check before printing"
                trigger={(open) => (
                  <PrintWarningButton
                    sheets={output?.sheets ?? []}
                    filename={source?.name ?? ""}
                    className={styles.detailsButton}
                    onClick={open}
                  />
                )}
              >
                <ul>
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`${ui.button} ${ui.compact}`}
                  disabled={processing}
                  onClick={() =>
                    void changeOptions({
                      paperMode: "a4",
                      scaleMode: "fit",
                      autoLayout: false,
                    })
                  }
                >
                  Fit copies on A4
                </button>
              </Modal>
            )}
            {source && (
              <Modal
                title="Document details"
                triggerClassName={styles.detailsButton}
              >
                <dl className={styles.summaryList} id="detailsList">
                  {[
                    ["Filename", source.name],
                    ["File size", formatBytes(source.size)],
                    [
                      "Source page",
                      formatPageSize(source.width, source.height),
                    ],
                    ["Output page", details.outputSize],
                    ["Copy scale", details.scale],
                    ["Layout", details.layout],
                  ].map(([label, value]) => (
                    <div className={styles.summaryRow} key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </Modal>
            )}
          </div>
        </div>
      )}
      {!!source?.warnings.length && (
        <p className={styles.sourceWarning} id="sourceWarning" role="status">
          {source.warnings.join(" ")}
        </p>
      )}
    </>
  );
}
