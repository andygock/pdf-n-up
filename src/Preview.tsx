import { useEffect, useRef } from "react";
import { createPreviewController, type PreviewOutput } from "./preview";

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
    <div className="native-preview-viewport" id="previewViewport">
      {output ? (
        <iframe
          key={output.url}
          className="pdf-viewer"
          // The fragment lets PDF.js infer a useful save filename from a Blob URL.
          src={`${output.url}#filename=${encodeURIComponent(output.filename)}&zoom=page-fit`}
          title={`PDF viewer: ${output.filename}`}
          loading="lazy"
        />
      ) : (
        <p className="preview-loading" role="status">
          Select a PDF to see the output preview.
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
      className="preview-viewport"
      id="previewViewport"
      ref={previewViewport}
    >
      <div
        className="preview-loading"
        id="previewLoading"
        role="status"
        ref={previewLoading}
      >
        Select a PDF to see the output preview.
      </div>
      <canvas
        className="pdf-preview hidden"
        id="pdfPreview"
        aria-label="Preview of the generated PDF"
        ref={pdfPreview}
      />
      <p
        className="preview-error hidden"
        id="previewError"
        ref={previewError}
      />
      <button
        className="button hidden"
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
