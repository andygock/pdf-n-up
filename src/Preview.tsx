import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./Preview.module.css";
import { createPreviewController } from "./preview";
import { Ruler, type RulerPage } from "./Ruler.tsx";
import type { PdfOutput } from "./types.ts";
import ui from "./ui.module.css";

export interface PreviewProps {
  output: PdfOutput | null;
  active: boolean;
  nativeViewer?: boolean;
  showMeasurements?: boolean;
  showRuler?: boolean;
  pageNumber?: number;
  rulerFooter?: HTMLElement | null;
}

export function Preview({
  output,
  active,
  nativeViewer = false,
  showMeasurements = false,
  showRuler = false,
  pageNumber = 1,
  rulerFooter,
}: PreviewProps) {
  const canvasOutput = useMemo(
    () =>
      output
        ? {
            ...output,
            previewPage: pageNumber,
            measurements: showMeasurements
              ? (output.sheets?.[pageNumber - 1] ?? output.measurements)
              : undefined,
          }
        : null,
    [output, showMeasurements, pageNumber],
  );
  if (!nativeViewer || showMeasurements || showRuler)
    return (
      <CanvasPreview
        output={canvasOutput}
        active={active}
        showRuler={showRuler}
        rulerFooter={rulerFooter}
      />
    );

  return (
    <div className={styles.nativePreviewViewport} id="previewViewport">
      {output && active ? (
        <iframe
          key={output.url}
          className={styles.pdfViewer}
          // The fragment lets PDF.js infer a useful save filename from a Blob URL.
          src={`${output.url}#filename=${encodeURIComponent(output.filename)}&zoom=page-fit`}
          title={`PDF viewer: ${output.filename}`}
          loading="lazy"
        />
      ) : (
        <p className={styles.previewLoading} role="status">
          {output
            ? "Preview paused while hidden."
            : "Select a PDF or image to see the output preview."}
        </p>
      )}
    </div>
  );
}

function CanvasPreview({
  output,
  active,
  showRuler,
  rulerFooter,
}: PreviewProps) {
  const [rendered, setRendered] = useState<{
    page: RulerPage | null;
    ready: boolean;
  }>({ page: null, ready: false });
  const [zoom, setZoom] = useState(1);
  const previewViewport = useRef<HTMLDivElement>(null);
  const previewLoading = useRef<HTMLDivElement>(null);
  const pdfPreview = useRef<HTMLCanvasElement>(null);
  const previewError = useRef<HTMLParagraphElement>(null);
  const retryPreviewButton = useRef<HTMLButtonElement>(null);
  const controller = useRef<ReturnType<typeof createPreviewController> | null>(
    null,
  );

  useEffect(() => {
    if (
      !previewViewport.current ||
      !previewLoading.current ||
      !pdfPreview.current ||
      !previewError.current ||
      !retryPreviewButton.current
    )
      return;
    const current = createPreviewController(
      {
        previewViewport: previewViewport.current,
        previewLoading: previewLoading.current,
        pdfPreview: pdfPreview.current,
        previewError: previewError.current,
        retryPreviewButton: retryPreviewButton.current,
      },
      {
        onPageRendered: (page) =>
          setRendered((previous) => ({
            page: page ?? previous.page,
            ready: page !== null,
          })),
      },
    );
    controller.current = current;
    const observer = new ResizeObserver(current.schedule);
    observer.observe(previewViewport.current);
    window.addEventListener("resize", current.schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", current.schedule);
      current.cancel();
      controller.current = null;
    };
  }, []);

  useEffect(() => controller.current?.update(output, active), [output, active]);
  useEffect(() => controller.current?.setZoom(zoom), [zoom]);

  return (
    <section
      className={`${styles.previewViewport} ${showRuler ? styles.withRuler : ""}`}
      id="previewViewport"
      ref={previewViewport}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard focus lets users scroll the sheet viewport to pan when zoomed.
      tabIndex={0}
      aria-label="Preview sheet. Scroll to pan when zoomed."
    >
      <div
        className={styles.previewLoading}
        id="previewLoading"
        role="status"
        ref={previewLoading}
      >
        Select a PDF or image to see the output preview.
      </div>
      {showRuler && rendered.page && (
        <fieldset
          className={styles.zoomControls}
          aria-label="Preview zoom controls"
        >
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
            aria-label="Zoom out"
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
            aria-label="Zoom in"
          >
            +
          </button>
          <button type="button" onClick={() => setZoom(1)}>
            Fit sheet
          </button>
          <button
            type="button"
            onClick={() => {
              const viewport = previewViewport.current;
              const page = rendered.page;
              if (viewport && page)
                setZoom(
                  Math.min(
                    3,
                    Math.max(
                      0.5,
                      (viewport.clientWidth - 60) / (page.displayWidth / zoom),
                    ),
                  ),
                );
            }}
          >
            Fit width
          </button>
        </fieldset>
      )}
      <div
        className={styles.previewStage}
        style={{
          width: rendered.page?.displayWidth ?? 0,
          height: rendered.page?.displayHeight ?? 0,
        }}
      >
        <canvas
          hidden
          className={styles.pdfPreview}
          id="pdfPreview"
          aria-label="Preview of the generated PDF"
          ref={pdfPreview}
        />
        {showRuler && rendered.page && output && active && (
          <Ruler
            key={`${output.url}:${output.previewPage}`}
            page={rendered.page}
            hidden={!rendered.ready}
            statusContainer={rulerFooter}
          />
        )}
      </div>
      <p
        hidden
        className={styles.previewError}
        id="previewError"
        ref={previewError}
      />
      <button
        hidden
        className={ui.button}
        id="retryPreviewButton"
        type="button"
        ref={retryPreviewButton}
        onClick={() => void controller.current?.render()}
      >
        Retry preview
      </button>
    </section>
  );
}
