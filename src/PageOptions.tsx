import { useEffect, useRef, useState } from "react";

import styles from "./ConversionOptions.module.css";

import { parsePageRange } from "./imposition.ts";

import { Modal } from "./Modal.tsx";

import { SourcePagePicker } from "./SourcePagePicker.tsx";

import { THUMBNAILS_PER_SCREEN } from "./thumbnails.ts";

import type { ConversionOptions, SourceMetadata } from "./types.ts";

import ui from "./ui.module.css";

interface PageDraft {
  mode: NonNullable<ConversionOptions["mode"]>;
  pageRange: string;
  pageOrder: NonNullable<ConversionOptions["pageOrder"]>;
  quantity: string | undefined;
  fillLastSheet: boolean;
  sourcePage: string;
}

function firstThumbnailPage(page: number) {
  return (
    Math.floor((page - 1) / THUMBNAILS_PER_SCREEN) * THUMBNAILS_PER_SCREEN + 1
  );
}

function createDraft(
  options: ConversionOptions,
  source: SourceMetadata | null,
): PageDraft {
  return {
    mode: options.mode ?? "repeat",
    pageRange: options.pageRange ?? "",
    pageOrder: options.pageOrder ?? "rows",
    quantity:
      options.quantity === undefined ? undefined : String(options.quantity),
    fillLastSheet: options.fillLastSheet ?? false,
    sourcePage: String(source?.pageNumber ?? 1),
  };
}

function sameOptionDraft(draft: PageDraft, options: ConversionOptions) {
  const quantity =
    draft.quantity === undefined ? undefined : Number(draft.quantity.trim());
  return (
    draft.mode === (options.mode ?? "repeat") &&
    draft.pageRange === (options.pageRange ?? "") &&
    draft.pageOrder === (options.pageOrder ?? "rows") &&
    (draft.mode === "sequence" ||
      ((draft.quantity === undefined ||
        (draft.quantity.trim() !== "" && quantity === options.quantity)) &&
        (draft.quantity !== undefined || options.quantity === undefined) &&
        draft.fillLastSheet === (options.fillLastSheet ?? false)))
  );
}

function sameDraft(
  draft: PageDraft,
  options: ConversionOptions,
  sourcePage: number | undefined,
) {
  const page = Number(draft.sourcePage.trim());
  return (
    sameOptionDraft(draft, options) &&
    (draft.mode === "sequence" ||
      sourcePage === undefined ||
      (draft.sourcePage.trim() !== "" && page === sourcePage))
  );
}

function optionsChanged(first: ConversionOptions, second: ConversionOptions) {
  return (
    first.mode !== second.mode ||
    first.pageRange !== second.pageRange ||
    first.pageOrder !== second.pageOrder ||
    first.quantity !== second.quantity ||
    first.fillLastSheet !== second.fillLastSheet
  );
}

export function PageOptions({
  source,
  sourceFile,
  options,
  processing,
  changeOptions,
  selectPage,
  applyPages,
}: {
  source: SourceMetadata | null;
  sourceFile: File | null;
  options: ConversionOptions;
  processing: boolean;
  changeOptions: (patch: Partial<ConversionOptions>) => Promise<unknown>;
  selectPage: (page: number) => Promise<unknown>;
  applyPages?: (
    patch: Partial<ConversionOptions>,
    page?: number,
  ) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(() => createDraft(options, source));
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const [firstPage, setFirstPage] = useState(() =>
    firstThumbnailPage(source?.pageNumber ?? 1),
  );
  const previous = useRef({
    sourceFile,
    options,
    sourcePage: source?.pageNumber,
  });

  useEffect(() => {
    const old = previous.current;
    if (old.sourceFile !== sourceFile) {
      setDraft(createDraft(options, source));
      setFirstPage(firstThumbnailPage(source?.pageNumber ?? 1));
      setError("");
    } else if (
      (optionsChanged(old.options, options) ||
        old.sourcePage !== source?.pageNumber) &&
      sameDraft(draft, old.options, old.sourcePage)
    ) {
      setDraft(createDraft(options, source));
    }
    previous.current = { sourceFile, options, sourcePage: source?.pageNumber };
  }, [
    sourceFile,
    source?.pageNumber,
    options.mode,
    options.pageRange,
    options.pageOrder,
    options.quantity,
    options.fillLastSheet,
    draft,
    source,
    options,
  ]);

  const hasPendingChanges = !sameDraft(draft, options, source?.pageNumber);
  const sourcePageNumber = Number(draft.sourcePage.trim());
  const thumbnailPageNumber =
    draft.sourcePage.trim() !== "" && Number.isInteger(sourcePageNumber)
      ? sourcePageNumber
      : -1;

  const apply = async (close: () => void) => {
    if (!hasPendingChanges || processing || applying) return;

    try {
      if (draft.mode === "sequence" && (draft.pageRange.trim() || source))
        parsePageRange(
          draft.pageRange,
          source?.pageCount ?? Number.MAX_SAFE_INTEGER,
        );

      if (draft.mode !== "sequence" && draft.quantity !== undefined) {
        const quantity = Number(draft.quantity.trim());
        if (
          draft.quantity.trim() === "" ||
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > 10000
        )
          throw new Error("Choose a whole number of copies from 1 to 10,000.");
      }

      if (source && draft.mode !== "sequence") {
        if (
          draft.sourcePage.trim() === "" ||
          !Number.isInteger(sourcePageNumber) ||
          sourcePageNumber < 1 ||
          sourcePageNumber > source.pageCount
        )
          throw new Error(`Choose a page from 1 to ${source.pageCount}.`);
      }

      const patch: Partial<ConversionOptions> = {};
      if (draft.mode !== (options.mode ?? "repeat")) patch.mode = draft.mode;
      if (draft.pageRange !== (options.pageRange ?? ""))
        patch.pageRange = draft.pageRange;
      if (draft.pageOrder !== (options.pageOrder ?? "rows"))
        patch.pageOrder = draft.pageOrder;
      const quantity =
        draft.quantity === undefined
          ? undefined
          : Number(draft.quantity.trim());
      if (draft.mode !== "sequence" && quantity !== options.quantity)
        patch.quantity = quantity;
      if (
        draft.mode !== "sequence" &&
        draft.fillLastSheet !== (options.fillLastSheet ?? false)
      )
        patch.fillLastSheet = draft.fillLastSheet;

      setApplying(true);
      setError("");
      if (applyPages) {
        if (
          (await applyPages(
            patch,
            source && draft.mode !== "sequence" ? sourcePageNumber : undefined,
          )) === false
        )
          throw new Error("The page settings could not be applied.");
      } else {
        if (Object.keys(patch).length && (await changeOptions(patch)) === false)
          throw new Error("The page settings could not be applied.");
        if (
          source &&
          draft.mode !== "sequence" &&
          sourcePageNumber !== source.pageNumber &&
          (await selectPage(sourcePageNumber)) === false
        )
          throw new Error("The selected source page could not be applied.");
      }

      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setApplying(false);
    }
  };

  const discard = (close: () => void) => {
    setDraft(createDraft(options, source));
    setError("");
    close();
  };

  const title =
    options.mode === "sequence"
      ? `Pages: ${options.pageRange?.trim() ? `${options.pageRange.trim().slice(0, 32)}${options.pageRange.trim().length > 32 ? "…" : ""}` : "all"}`
      : `Pages: repeat${source ? ` ${source.pageNumber}` : ""}${options.quantity ? ` · ${options.quantity} copies` : ""}`;

  return (
    <Modal
      title={title}
      trigger={(open) => (
        <button
          type="button"
          aria-haspopup="dialog"
          className={`${ui.button} ${ui.compact} ${ui.quiet}`}
          onClick={open}
        >
          {title}
          {hasPendingChanges ? " · changes pending" : ""}
        </button>
      )}
    >
      {(close) => (
        <div className={styles.advancedFields}>
          <label className={ui.field} htmlFor="pageMode">
            Arrange
            <select
              id="pageMode"
              className={ui.control}
              disabled={processing || applying}
              value={draft.mode}
              onChange={(event) => {
                setDraft({
                  ...draft,
                  mode: event.target.value as PageDraft["mode"],
                });
                setError("");
              }}
            >
              <option value="repeat">Repeat one page</option>
              <option value="sequence">Sequential pages</option>
            </select>
          </label>
          {draft.mode === "sequence" ? (
            <>
              <label className={ui.field} htmlFor="pageRange">
                Page range
                <input
                  id="pageRange"
                  type="text"
                  className={ui.control}
                  disabled={processing || applying}
                  value={draft.pageRange}
                  maxLength={60000}
                  placeholder="All pages, or 1-4, 7, 9-12"
                  aria-describedby={error ? "pageOptionsError" : undefined}
                  onChange={(event) => {
                    setDraft({ ...draft, pageRange: event.target.value });
                    setError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void apply(close);
                    }
                  }}
                />
              </label>
              <label className={ui.field} htmlFor="pageOrder">
                Fill cells
                <select
                  id="pageOrder"
                  className={ui.control}
                  disabled={processing || applying}
                  value={draft.pageOrder}
                  onChange={(event) => {
                    setDraft({
                      ...draft,
                      pageOrder: event.target.value as PageDraft["pageOrder"],
                    });
                    setError("");
                  }}
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
              <input
                id="sourcePage"
                className={ui.control}
                type="number"
                min={1}
                max={source.pageCount}
                step={1}
                disabled={processing || applying}
                value={draft.sourcePage}
                aria-describedby={error ? "pageOptionsError" : undefined}
                onChange={(event) => {
                  setDraft({ ...draft, sourcePage: event.target.value });
                  setError("");
                }}
              />
            </label>
          ) : (
            <p>Repeats the selected source page in every cell.</p>
          )}
          {draft.mode !== "sequence" &&
            source &&
            source.pageCount > 1 &&
            sourceFile && (
              <SourcePagePicker
                file={sourceFile}
                pageCount={source.pageCount}
                pageNumber={thumbnailPageNumber}
                disabled={processing || applying}
                firstPage={firstPage}
                onFirstPageChange={setFirstPage}
                onSelect={(page) => {
                  setDraft({ ...draft, sourcePage: String(page) });
                  setError("");
                }}
              />
            )}
          {draft.mode !== "sequence" && (
            <>
              <label className={ui.checkbox}>
                <input
                  type="checkbox"
                  disabled={processing || applying}
                  checked={draft.quantity !== undefined}
                  onChange={(event) => {
                    setDraft({
                      ...draft,
                      quantity: event.target.checked ? "50" : undefined,
                    });
                    setError("");
                  }}
                />
                Specify total quantity
              </label>
              {draft.quantity !== undefined && (
                <>
                  <label className={ui.field} htmlFor="quantity">
                    Copies required
                    <input
                      id="quantity"
                      className={ui.control}
                      type="number"
                      min={1}
                      max={10000}
                      step={1}
                      disabled={processing || applying}
                      value={draft.quantity}
                      aria-describedby={error ? "pageOptionsError" : undefined}
                      onChange={(event) => {
                        setDraft({ ...draft, quantity: event.target.value });
                        setError("");
                      }}
                    />
                  </label>
                  <label className={ui.checkbox}>
                    <input
                      type="checkbox"
                      disabled={processing || applying}
                      checked={draft.fillLastSheet}
                      onChange={(event) => {
                        setDraft({
                          ...draft,
                          fillLastSheet: event.target.checked,
                        });
                        setError("");
                      }}
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
          <p role="status">
            {applying
              ? "Applying page settings…"
              : hasPendingChanges
                ? "Page changes are pending. Apply pages to update the PDF, or discard changes."
                : "No page changes are pending."}
          </p>
          {error && (
            <p id="pageOptionsError" role="alert">
              {error}
            </p>
          )}
          <div>
            <button
              type="button"
              disabled={!hasPendingChanges || processing || applying}
              className={`${ui.button} ${ui.compact} ${ui.primary}`}
              onClick={() => void apply(close)}
            >
              Apply pages
            </button>
            <button
              type="button"
              disabled={!hasPendingChanges || processing || applying}
              className={`${ui.button} ${ui.compact}`}
              onClick={() => discard(close)}
            >
              Discard changes
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
