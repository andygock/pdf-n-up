import { useEffect, useRef } from "react";
import styles from "./Preview.module.css";
import { createPreviewController, type PreviewOutput } from "./preview";
import ui from "./ui.module.css";

export interface PreviewProps {
  output: PreviewOutput | null;
  active: boolean;
  nativeViewer?: boolean;
}

export function Preview({
  output,
  active,
  nativeViewer = false,
}: PreviewProps) {
  if (!nativeViewer) return <CanvasPreview output={output} active={active} />;

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
            : "Select a PDF to see the output preview."}
        </p>
      )}
    </div>
  );
}

function CanvasPreview({ output, active }: PreviewProps) {
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
    const current = createPreviewController({
      previewViewport: previewViewport.current,
      previewLoading: previewLoading.current,
      pdfPreview: pdfPreview.current,
      previewError: previewError.current,
      retryPreviewButton: retryPreviewButton.current,
    });
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

  return (
    <div
      className={styles.previewViewport}
      id="previewViewport"
      ref={previewViewport}
    >
      <div
        className={styles.previewLoading}
        id="previewLoading"
        role="status"
        ref={previewLoading}
      >
        Select a PDF to see the output preview.
      </div>
      <canvas
        hidden
        className={styles.pdfPreview}
        id="pdfPreview"
        aria-label="Preview of the generated PDF"
        ref={pdfPreview}
      />
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
    </div>
  );
}
