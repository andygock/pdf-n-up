import { useEffect, useState } from "react";
import styles from "./ConversionOptions.module.css";
import { parsePageRange } from "./imposition.ts";
import { Modal } from "./Modal.tsx";
import { SourcePagePicker } from "./SourcePagePicker.tsx";
import { SpacingInput } from "./SpacingInput.tsx";
import type { ConversionOptions, SourceMetadata } from "./types.ts";
import ui from "./ui.module.css";

export function PageOptions({
  source,
  sourceFile,
  options,
  processing,
  changeOptions,
  selectPage,
}: {
  source: SourceMetadata | null;
  sourceFile: File | null;
  options: ConversionOptions;
  processing: boolean;
  changeOptions: (patch: Partial<ConversionOptions>) => Promise<void>;
  selectPage: (page: number) => Promise<void>;
}) {
  const [range, setRange] = useState(options.pageRange ?? "");
  const [error, setError] = useState("");
  useEffect(() => {
    setRange(options.pageRange ?? "");
    setError("");
  }, [options.pageRange]);
  const applyRange = () => {
    try {
      if (range.trim() || source)
        parsePageRange(range, source?.pageCount ?? Number.MAX_SAFE_INTEGER);
      setError("");
      void changeOptions({ pageRange: range });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <Modal
      title={options.mode === "sequence" ? "Pages: sequential" : "Pages"}
      triggerClassName={`${ui.button} ${ui.compact} ${ui.quiet}`}
    >
      {() => (
        <div className={styles.advancedFields}>
          <label className={ui.field} htmlFor="pageMode">
            Arrange
            <select
              id="pageMode"
              className={ui.control}
              disabled={processing}
              value={options.mode ?? "repeat"}
              onChange={(event) =>
                void changeOptions({
                  mode: event.target.value as ConversionOptions["mode"],
                })
              }
            >
              <option value="repeat">Repeat one page</option>
              <option value="sequence">Sequential pages</option>
            </select>
          </label>
          {options.mode === "sequence" ? (
            <>
              <label className={ui.field} htmlFor="pageRange">
                Page range
                <input
                  id="pageRange"
                  type="text"
                  className={ui.control}
                  disabled={processing}
                  value={range}
                  maxLength={60000}
                  placeholder="All pages, or 1-4, 7, 9-12"
                  onChange={(event) => setRange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applyRange();
                  }}
                />
              </label>
              <button
                type="button"
                disabled={processing || range === (options.pageRange ?? "")}
                className={`${ui.button} ${ui.compact}`}
                onClick={applyRange}
              >
                Apply page range
              </button>
              {error && <p role="alert">{error}</p>}
              <label className={ui.field} htmlFor="pageOrder">
                Fill cells
                <select
                  id="pageOrder"
                  className={ui.control}
                  disabled={processing}
                  value={options.pageOrder ?? "rows"}
                  onChange={(event) =>
                    void changeOptions({
                      pageOrder: event.target
                        .value as ConversionOptions["pageOrder"],
                    })
                  }
                >
                  <option value="rows">Across rows, then down</option>
                  <option value="columns">Down columns, then across</option>
                </select>
              </label>
              <p>
                Ranges follow the order entered. Empty cells on the final sheet
                stay blank. Mixed page sizes fit proportionally in the same
                grid; exact sizing reports pages that cannot fit. The first
                selected page determines expanded or source-sized paper.
              </p>
            </>
          ) : source && source.pageCount > 1 ? (
            <label className={ui.field} htmlFor="sourcePage">
              Page to repeat (1-{source.pageCount})
              <SpacingInput
                id="sourcePage"
                min={1}
                max={source.pageCount}
                step={1}
                value={source.pageNumber}
                disabled={processing}
                onCommit={(page) => void selectPage(page)}
              />
            </label>
          ) : (
            <p>Repeats the selected source page in every cell.</p>
          )}
          {options.mode !== "sequence" &&
            source &&
            source.pageCount > 1 &&
            sourceFile && (
              <SourcePagePicker
                file={sourceFile}
                pageCount={source.pageCount}
                pageNumber={source.pageNumber}
                disabled={processing}
                onSelect={selectPage}
              />
            )}
          {options.mode !== "sequence" && (
            <>
              <label className={ui.checkbox}>
                <input
                  type="checkbox"
                  disabled={processing}
                  checked={options.quantity !== undefined}
                  onChange={(event) =>
                    void changeOptions({
                      quantity: event.target.checked ? 50 : undefined,
                    })
                  }
                />
                Specify total quantity
              </label>
              {options.quantity !== undefined && (
                <>
                  <label className={ui.field} htmlFor="quantity">
                    Copies required
                    <SpacingInput
                      id="quantity"
                      min={1}
                      max={10000}
                      step={1}
                      disabled={processing}
                      value={options.quantity}
                      onCommit={(quantity) => void changeOptions({ quantity })}
                    />
                  </label>
                  <label className={ui.checkbox}>
                    <input
                      type="checkbox"
                      disabled={processing}
                      checked={options.fillLastSheet ?? false}
                      onChange={(event) =>
                        void changeOptions({
                          fillLastSheet: event.target.checked,
                        })
                      }
                    />
                    Fill the last sheet with extra copies
                  </label>
                  <p>
                    Creates enough sheets for your quantity. Unused cells stay
                    blank unless you choose to fill the last sheet.
                  </p>
                </>
              )}
            </>
          )}
          <p className={styles.hint}>
            Batch conversion applies these settings to each PDF separately. Up
            to 10,000 selected pages and 1,000 output sheets per PDF.
          </p>
        </div>
      )}
    </Modal>
  );
}
