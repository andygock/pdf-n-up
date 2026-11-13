import { useEffect, useRef, useState } from "react";
import styles from "./BatchPanel.module.css";
import { Modal } from "./Modal.tsx";
import { PrintWarningButton } from "./PrintWarningButton.tsx";
import { printWarnings } from "./print-warnings.ts";
import { SpacingInput } from "./SpacingInput.tsx";
import { getSourceFormat, SOURCE_ACCEPT } from "./source-format.ts";
import type { ConversionOptions } from "./types.ts";
import ui from "./ui.module.css";
import type { useBatch } from "./useBatch.ts";

export function BatchPanel({
  batch,
  options,
  disabled,
}: {
  batch: ReturnType<typeof useBatch>;
  options: ConversionOptions;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const replacementInput = useRef<HTMLInputElement>(null);
  const replacementId = useRef<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const completed = batch.entries.filter(
    (entry) => entry.status === "ready" || entry.status === "failed",
  ).length;
  useEffect(() => {
    if (batch.entries.length || batch.message) setExpanded(true);
  }, [batch.entries.length, batch.message]);
  return (
    <details
      className={`${ui.panel} ${styles.panel}`}
      aria-label="Batch conversion"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className={styles.summary}>
        <span>Batch conversion</span>
        <span className={styles.summaryMeta}>
          {batch.entries.length
            ? `${batch.entries.length} files`
            : "Multiple files"}
        </span>
      </summary>
      <div className={styles.header}>
        <div className={styles.heading}>
          <p>
            PDF, JPEG or PNG · Up to 20 files · 100 MB total · 50 MB per file
          </p>
        </div>
        <div className={styles.actions}>
          <input
            ref={input}
            type="file"
            multiple
            accept={SOURCE_ACCEPT}
            hidden
            disabled={disabled}
            onChange={(event) => {
              batch.selectFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className={`${ui.button} ${ui.compact}`}
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            {batch.entries.length
              ? "Replace batch files"
              : "Choose batch files"}
          </button>
          <input
            ref={replacementInput}
            type="file"
            accept={SOURCE_ACCEPT}
            hidden
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && replacementId.current !== null)
                batch.replaceFile(replacementId.current, file);
              replacementId.current = null;
              event.target.value = "";
            }}
          />
          {batch.entries.length > 0 && (
            <>
              <button
                type="button"
                className={`${ui.button} ${ui.compact} ${ui.primary}`}
                disabled={disabled}
                onClick={() => void batch.run(options)}
              >
                Convert batch
              </button>
              {batch.processing ? (
                <button
                  type="button"
                  className={`${ui.button} ${ui.compact}`}
                  onClick={batch.cancel}
                >
                  Cancel batch
                </button>
              ) : (
                <button
                  type="button"
                  className={`${ui.button} ${ui.compact}`}
                  onClick={batch.clear}
                >
                  Clear batch
                </button>
              )}
              <button
                type="button"
                className={`${ui.button} ${ui.compact}`}
                disabled={!batch.archive || disabled}
                onClick={() => void batch.save()}
              >
                Save ZIP
              </button>
            </>
          )}
        </div>
      </div>
      {batch.message && (
        <p className={styles.message} role="status">
          {batch.message}
        </p>
      )}
      {batch.processing && (
        <label className={styles.progress}>
          {completed} of {batch.entries.length} files complete
          <progress value={completed} max={batch.entries.length} />
        </label>
      )}
      {batch.isStale(options) && (
        <p className={styles.stale}>
          Settings have changed. These results use the settings from the last
          run. Convert the batch again to apply your changes.
        </p>
      )}
      {batch.entries.length > 0 && (
        <ul className={styles.files}>
          {batch.entries.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.file.name}</strong>
              <button
                type="button"
                className={`${ui.button} ${ui.compact}`}
                disabled={disabled}
                aria-label={`Replace ${entry.file.name}`}
                onClick={() => {
                  replacementId.current = entry.id;
                  replacementInput.current?.click();
                }}
              >
                Replace
              </button>
              <button
                type="button"
                className={`${ui.button} ${ui.compact}`}
                disabled={disabled}
                aria-label={`Remove ${entry.file.name}`}
                onClick={() => batch.remove(entry.id)}
              >
                Remove
              </button>
              {options.mode !== "sequence" &&
                getSourceFormat(entry.file.name) === "pdf" && (
                  <label className={ui.field} htmlFor={`batchPage${entry.id}`}>
                    Page{" "}
                    <SpacingInput
                      key={`${entry.id}-${entry.file.name}`}
                      id={`batchPage${entry.id}`}
                      value={entry.pageNumber}
                      min={1}
                      max={100000}
                      step={1}
                      disabled={disabled}
                      onCommit={(page) => batch.setPage(entry.id, page)}
                    />
                  </label>
                )}
              <span className={styles.status} data-status={entry.status}>
                {entry.status}
              </span>
              {entry.output && (
                <button
                  type="button"
                  className={`${ui.button} ${ui.compact}`}
                  onClick={() => void batch.save(entry.id)}
                >
                  Save PDF
                </button>
              )}
              {entry.output &&
                printWarnings(entry.output.sheets ?? [], entry.file.name)
                  .length > 0 && (
                  <Modal
                    title="Check before printing"
                    trigger={(open) => (
                      <PrintWarningButton
                        sheets={entry.output?.sheets ?? []}
                        filename={entry.file.name}
                        className={`${ui.button} ${ui.compact} ${ui.quiet}`}
                        onClick={open}
                      />
                    )}
                  >
                    <ul>
                      {printWarnings(
                        entry.output.sheets ?? [],
                        entry.file.name,
                      ).map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </Modal>
                )}
              {entry.error && <p>{entry.error}</p>}
              {entry.replacementError && (
                <p role="status">{entry.replacementError}</p>
              )}
              {entry.warnings?.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
