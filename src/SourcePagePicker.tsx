import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./SourcePagePicker.module.css";
import {
  createThumbnailController,
  THUMBNAILS_PER_SCREEN,
} from "./thumbnails.ts";
import ui from "./ui.module.css";

export function SourcePagePicker({
  file,
  pageCount,
  pageNumber,
  disabled,
  onSelect,
}: {
  file: File;
  pageCount: number;
  pageNumber: number;
  disabled: boolean;
  onSelect: (page: number) => Promise<void>;
}) {
  const [firstPage, setFirstPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("Loading thumbnails...");
  const [failed, setFailed] = useState(false);
  const canvases = useRef(new Map<number, HTMLCanvasElement>());
  const controller = useRef<ReturnType<
    typeof createThumbnailController
  > | null>(null);
  useEffect(() => {
    const current = createThumbnailController(file);
    controller.current = current;
    return () => {
      current.dispose();
      controller.current = null;
    };
  }, [file]);
  useEffect(() => {
    setFirstPage(
      Math.floor((pageNumber - 1) / THUMBNAILS_PER_SCREEN) *
        THUMBNAILS_PER_SCREEN +
        1,
    );
  }, [pageNumber]);
  const pages = useMemo(
    () =>
      Array.from(
        {
          length: Math.min(
            THUMBNAILS_PER_SCREEN,
            Math.max(0, pageCount - firstPage + 1),
          ),
        },
        (_, index) => firstPage + index,
      ),
    [firstPage, pageCount],
  );
  useEffect(() => {
    const current = controller.current;
    if (!current || current.file !== file) return;
    let live = true;
    setStatus(attempt ? "Retrying thumbnails..." : "Loading thumbnails...");
    setFailed(false);
    const targets = pages.flatMap((page) => {
      const canvas = canvases.current.get(page);
      return canvas ? [{ page, canvas }] : [];
    });
    void current
      .render(targets)
      .then(() => {
        if (live) setStatus("Select a thumbnail to repeat that page.");
      })
      .catch((error: unknown) => {
        if (!live) return;
        setFailed(true);
        setStatus(
          `${error instanceof Error ? error.message : String(error)} You can still use the page-number field.`,
        );
      });
    return () => {
      live = false;
      current.cancelRender();
    };
  }, [pages, attempt, file]);
  return (
    <section aria-label="Source page thumbnails">
      <p className={styles.status} role="status">
        {status}
      </p>
      {failed && (
        <button
          type="button"
          className={`${ui.button} ${ui.compact}`}
          onClick={() => setAttempt(attempt + 1)}
        >
          Retry thumbnails
        </button>
      )}
      <div className={styles.grid}>
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            className={styles.page}
            disabled={disabled}
            aria-pressed={page === pageNumber}
            onClick={() => void onSelect(page)}
          >
            <span className={styles.canvasFrame}>
              <canvas
                aria-label={`Source page ${page}`}
                ref={(canvas) => {
                  if (canvas) canvases.current.set(page, canvas);
                  else canvases.current.delete(page);
                }}
              />
            </span>
            <span>Page {page}</span>
          </button>
        ))}
      </div>
      {pageCount > THUMBNAILS_PER_SCREEN && (
        <nav className={styles.pagination} aria-label="Thumbnail pages">
          <button
            type="button"
            className={`${ui.button} ${ui.compact}`}
            disabled={firstPage === 1 || disabled}
            onClick={() =>
              setFirstPage(Math.max(1, firstPage - THUMBNAILS_PER_SCREEN))
            }
          >
            Previous
          </button>
          <span>
            {firstPage}-
            {Math.min(firstPage + THUMBNAILS_PER_SCREEN - 1, pageCount)} of{" "}
            {pageCount}
          </span>
          <button
            type="button"
            className={`${ui.button} ${ui.compact}`}
            disabled={firstPage + THUMBNAILS_PER_SCREEN > pageCount || disabled}
            onClick={() => setFirstPage(firstPage + THUMBNAILS_PER_SCREEN)}
          >
            Next
          </button>
        </nav>
      )}
      <p className={styles.status}>
        Preview only: images above 16 megapixels may be omitted.
      </p>
    </section>
  );
}
