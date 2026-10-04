import { useEffect, useRef, useState } from "react";
import { formatBytes, formatPageSize, pageTitles } from "./format.ts";
import { LAYOUTS } from "./geometry.ts";
import { Help } from "./Help.tsx";
import { Preview } from "./Preview.tsx";
import { SpacingInput } from "./SpacingInput.tsx";
import { useConversion } from "./useConversion.ts";

type View = keyof typeof pageTitles;
const viewFromHash = (): View => {
  const hash = window.location?.hash;
  return hash === "#view-guide"
    ? "guide"
    : hash === "#view-privacy"
      ? "privacy"
      : "convert";
};

export default function App() {
  const nativeViewer = navigator.pdfViewerEnabled === true;
  const [view, setView] = useState<View>(viewFromHash);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    source,
    output,
    options,
    processing,
    status,
    failed,
    details,
    selectFiles,
    changeOptions,
    clearDocument: clear,
    openOutput,
  } = useConversion();

  const clearDocument = () => {
    clear();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  useEffect(() => {
    const navigate = () => {
      setView(viewFromHash());
      window.scrollTo({ top: 0, behavior: "smooth" });
      headingRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);

  useEffect(() => {
    // One viewport-level drop handler also covers replacement files. The overlay
    // receives drops over the embedded viewer, which has its own document.
    const dragEnter = (event: DragEvent) => {
      event.preventDefault();
      if (!event.dataTransfer?.types.includes("Files")) return;
      dragDepth.current += 1;
      if (!processing) setDragging(true);
    };
    const dragOver = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer)
        event.dataTransfer.dropEffect = processing ? "none" : "copy";
    };
    const resetDrag = () => {
      dragDepth.current = 0;
      setDragging(false);
    };
    const dragLeave = (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    };
    const drop = async (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      resetDrag();
      const files = event.dataTransfer?.files;
      if (!files?.length || processing) return;
      window.location.hash = "#view-convert";
      setView("convert");
      await selectFiles(files);
    };
    window.addEventListener("dragenter", dragEnter);
    window.addEventListener("dragover", dragOver);
    window.addEventListener("dragleave", dragLeave);
    window.addEventListener("drop", drop);
    window.addEventListener("dragend", resetDrag);
    window.addEventListener("blur", resetDrag);
    return () => {
      window.removeEventListener("dragenter", dragEnter);
      window.removeEventListener("dragover", dragOver);
      window.removeEventListener("dragleave", dragLeave);
      window.removeEventListener("drop", drop);
      window.removeEventListener("dragend", resetDrag);
      window.removeEventListener("blur", resetDrag);
    };
  }, [processing, selectFiles]);

  return (
    <div className="app-shell">
      {dragging && (
        <div className="drop-overlay" role="status">
          <div>
            <strong>
              {source ? "Drop to replace your PDF" : "Drop your PDF anywhere"}
            </strong>
            <span>One page · up to 50 MB</span>
          </div>
        </div>
      )}
      <header className="topbar">
        <a
          className="brand"
          href="#view-convert"
          aria-label="PDF N-up — back to converter"
        >
          <img className="brand-mark" src="./icon.svg" alt="" />
          <span className="brand-title">PDF N-up</span>
        </a>
      </header>

      <main>
        <div
          className={`page-heading${view === "convert" && source ? " compact-heading" : ""}`}
        >
          <div>
            <h1
              className="page-title"
              id="pageTitle"
              ref={headingRef}
              tabIndex={-1}
            >
              {pageTitles[view].title}
            </h1>
            {!(view === "convert" && source) && (
              <p className="page-description" id="pageDescription">
                {pageTitles[view].description}
              </p>
            )}
          </div>
          {view !== "convert" && (
            <a
              className="button compact"
              href="#view-convert"
              data-view="convert"
            >
              ← Back to PDF
            </a>
          )}
        </div>

        <section
          className={view === "convert" ? "view" : "view hidden"}
          id="view-convert"
          data-view-container="convert"
        >
          <div className={`converter${source ? " has-document" : ""}`}>
            <section
              className={`source-bar${dragging ? " dragging" : ""}${source ? " has-file" : ""}`}
              id="dropZone"
              aria-label="Source PDF"
            >
              <input
                id="fileInput"
                ref={fileInputRef}
                disabled={processing}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  void selectFiles(files);
                }}
                type="file"
                accept="application/pdf,.pdf"
                hidden
              />
              <div className="file-symbol" aria-hidden="true">
                PDF
              </div>
              <div className="source-copy">
                <h2 id="dropTitle">{source?.name ?? "Drop a PDF anywhere"}</h2>
                <p id="dropDescription">
                  {source
                    ? `${formatBytes(source.size)} · ${formatPageSize(source.width, source.height)} · one page`
                    : "One page, up to 50 MB. Converts as soon as you choose a file."}
                </p>
              </div>
              <div className="document-actions">
                <button
                  className={`button ${source ? "compact" : "primary"}`}
                  id="selectFileButton"
                  disabled={processing}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  {source ? "Replace PDF" : "Choose PDF"}
                </button>
                {source && !processing && (
                  <button
                    className="button compact quiet"
                    id="clearDocumentButton"
                    type="button"
                    onClick={clearDocument}
                  >
                    Clear
                  </button>
                )}
                {processing && (
                  <button
                    className="button compact"
                    id="cancelButton"
                    onClick={clearDocument}
                    type="button"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </section>

            <section
              className="panel conversion-options"
              aria-label="Conversion options"
            >
              <fieldset className="option-group">
                <legend>Copies per sheet</legend>
                <div className="layout-options" id="layoutOptions">
                  {Object.values(LAYOUTS).map((layout) => (
                    <label className="layout-option" key={layout.copies}>
                      <input
                        type="radio"
                        name="layout"
                        value={String(layout.copies)}
                        disabled={processing}
                        checked={options.layout.copies === layout.copies}
                        onChange={() => void changeOptions({ layout })}
                      />
                      <span className="layout-card">
                        <svg
                          className="layout-diagram"
                          viewBox="0 0 48 36"
                          aria-hidden="true"
                        >
                          <rect x="1" y="1" width="46" height="34" />
                          {Array.from(
                            { length: layout.columns - 1 },
                            (_, column) => {
                              const x =
                                1 + ((column + 1) * 46) / layout.columns;
                              return <path key={`c${x}`} d={`M${x} 1v34`} />;
                            },
                          )}
                          {Array.from({ length: layout.rows - 1 }, (_, row) => {
                            const y = 1 + ((row + 1) * 34) / layout.rows;
                            return <path key={`r${y}`} d={`M1 ${y}h46`} />;
                          })}
                        </svg>
                        <strong>{layout.copies}-up</strong>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="option-group size-options">
                <legend>Output paper</legend>
                <label className="size-option">
                  <input
                    type="radio"
                    name="paperMode"
                    value="expand"
                    disabled={processing}
                    checked={options.paperMode === "expand"}
                    onChange={() => void changeOptions({ paperMode: "expand" })}
                  />
                  <span>
                    <strong>Expand paper</strong>
                    <small>Original-size copies</small>
                  </span>
                </label>
                <label className="size-option">
                  <input
                    type="radio"
                    name="paperMode"
                    value="same"
                    disabled={processing}
                    checked={options.paperMode === "same"}
                    onChange={() => void changeOptions({ paperMode: "same" })}
                  />
                  <span>
                    <strong>Same paper</strong>
                    <small>Scale copies to fit</small>
                  </span>
                </label>
              </fieldset>
              <fieldset className="option-group spacing-options">
                <legend>Spacing (mm)</legend>
                <label htmlFor="marginMm">
                  Margin
                  <SpacingInput
                    id="marginMm"
                    disabled={processing}
                    value={options.marginMm ?? 0}
                    onCommit={(value) =>
                      void changeOptions({ marginMm: value })
                    }
                  />
                </label>
                <label htmlFor="gutterMm">
                  Gap
                  <SpacingInput
                    id="gutterMm"
                    disabled={processing}
                    value={options.gutterMm ?? 0}
                    onCommit={(value) =>
                      void changeOptions({ gutterMm: value })
                    }
                  />
                </label>
              </fieldset>
            </section>

            {(source || processing || status.type === "error") && (
              <div className="feedback-row">
                <div
                  className={`status-box ${status.type ?? "neutral"}`}
                  id="statusBox"
                  role="status"
                  aria-live="polite"
                >
                  <span className="status-symbol" aria-hidden="true">
                    {status.loading ? (
                      <span className="spinner" />
                    ) : (
                      (status.symbol ?? "i")
                    )}
                  </span>
                  <div>
                    <strong id="statusTitle">{status.title}</strong>
                    <span className="status-message" id="statusMessage">
                      {output &&
                      status.type === "success" &&
                      status.title === "Output ready"
                        ? `${details.layout} · ${details.outputSize} · ${details.scale} scale`
                        : status.message}
                    </span>
                  </div>
                  {processing && (
                    <div className="progress-track">
                      <div className="progress-bar indeterminate" />
                    </div>
                  )}
                </div>
                {failed && source && options.paperMode !== "same" && (
                  <button
                    className="button compact"
                    id="useSourceSizeButton"
                    onClick={() => void changeOptions({ paperMode: "same" })}
                    type="button"
                  >
                    Use source-page size
                  </button>
                )}
                {source && (
                  <details className="source-details" id="sourceDetails">
                    <summary>Document details</summary>
                    <dl className="summary-list" id="detailsList">
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
                        <div className="summary-row" key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </div>
            )}
            {!!source?.warnings.length && (
              <p className="source-warning" id="sourceWarning" role="status">
                {source.warnings.join(" ")}
              </p>
            )}

            {(source || processing) && (
              <article
                className={`panel output-panel${output ? " has-output" : ""}`}
                id="outputPanel"
              >
                <div className="panel-header output-header">
                  <div className="output-copy">
                    <h2 className="panel-title">
                      {output ? "Your PDF" : "Output preview"}
                    </h2>
                    <p className="panel-subtitle" id="outputSummary">
                      {output
                        ? `${output.filename} · ${formatBytes(output.size)}`
                        : "Choose a PDF above to get started."}
                    </p>
                  </div>
                  <div className="output-actions">
                    <button
                      className="button compact"
                      id="openOutputButton"
                      type="button"
                      disabled={!output}
                      onClick={() => void openOutput(false)}
                    >
                      Open in tab ↗
                    </button>
                    {!nativeViewer && (
                      <button
                        className="button primary compact"
                        id="downloadOutputButton"
                        disabled={!output}
                        onClick={() => void openOutput(true)}
                        type="button"
                      >
                        Save PDF
                      </button>
                    )}
                  </div>
                </div>
                <Preview
                  output={output}
                  active={view === "convert"}
                  nativeViewer={nativeViewer}
                />
                <p className="preview-note">
                  {nativeViewer
                    ? "Save or print using the PDF toolbar. "
                    : "Preview only: images above 16 megapixels may be omitted. Open the PDF to check before printing. "}
                  Print at actual size to keep these dimensions.
                </p>
              </article>
            )}
          </div>
        </section>
        <Help view={view} />
      </main>

      <footer>
        <nav aria-label="Help and information">
          {(
            [
              ["guide", "How it works"],
              ["privacy", "Privacy"],
            ] as const
          ).map(([target, label]) => (
            <a
              key={target}
              href={`#view-${target}`}
              data-view={target}
              aria-current={view === target ? "page" : undefined}
            >
              {label}
            </a>
          ))}
          <a
            href="https://github.com/andygock/pdf-n-up"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub ↗
          </a>
        </nav>
      </footer>
    </div>
  );
}
