import { useRef } from "react";
import styles from "./BatchPanel.module.css";
import { SpacingInput } from "./SpacingInput.tsx";
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
  return (
    <section
      className={`${ui.panel} ${styles.panel}`}
      aria-label="Batch conversion"
    >
      <h2>Batch conversion</h2>
      <p>
        Use the settings above for up to 20 PDFs (100 MB total, 50 MB per file).
        Page 1 is selected by default. Each result repeats one selected page.
      </p>
      <div className={styles.actions}>
        <input
          ref={input}
          type="file"
          multiple
          accept="application/pdf,.pdf"
          hidden
          disabled={disabled}
          onChange={(event) => {
            batch.selectFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <button
          type="button"
          className={ui.button}
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          Choose batch PDFs
        </button>
        {batch.entries.length > 0 && (
          <>
            <button
              type="button"
              className={`${ui.button} ${ui.primary}`}
              disabled={disabled}
              onClick={() => void batch.run(options)}
            >
              Convert batch
            </button>
            {batch.processing ? (
              <button
                type="button"
                className={ui.button}
                onClick={batch.cancel}
              >
                Cancel batch
              </button>
            ) : (
              <button type="button" className={ui.button} onClick={batch.clear}>
                Clear batch
              </button>
            )}
            <button
              type="button"
              className={ui.button}
              disabled={!batch.archive || disabled}
              onClick={() => void batch.save()}
            >
              Save ZIP
            </button>
          </>
        )}
      </div>
      {batch.message && <p role="status">{batch.message}</p>}
      {batch.entries.length > 0 && (
        <ul className={styles.files}>
          {batch.entries.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.file.name}</strong>
              <label htmlFor={`batchPage${entry.id}`}>
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
              <span>{entry.status}</span>
              {entry.output && (
                <button
                  type="button"
                  className={ui.button}
                  onClick={() => void batch.save(entry.id)}
                >
                  Save PDF
                </button>
              )}
              {entry.error && <p>{entry.error}</p>}
              {entry.warnings?.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
