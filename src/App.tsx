import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { formatBytes, formatPageSize, pageTitles } from "./format.ts";
import { LAYOUTS } from "./geometry.ts";
import { Preview } from "./Preview.tsx";
import { useConversion } from "./useConversion.ts";

type View = keyof typeof pageTitles;
export default function App() {
  const [view, setView] = useState<View>("convert");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 900px)").matches,
  );
  const [dragging, setDragging] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
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
  const closeMenu = () => setMenuOpen(false);
  const navigate = (next: View) => {
    setView(next);
    closeMenu();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    if (!menuOpen) return;
    sidebarRef.current
      ?.querySelector<HTMLButtonElement>("[data-view]")
      ?.focus();
    return () => {
      menuButtonRef.current?.focus();
    };
  }, [menuOpen]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const resize = () => {
      setMobile(media.matches);
      setMenuOpen(false);
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    // Prevent browser navigation even when a file is dropped outside the target.
    const preventFileOpen = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const events = ["dragenter", "dragover", "dragleave", "drop"];
    events.forEach((name) => {
      window.addEventListener(name, preventFileOpen);
    });
    media.addEventListener("change", resize);
    window.addEventListener("keydown", handleEscape);
    return () => {
      events.forEach((name) => {
        window.removeEventListener(name, preventFileOpen);
      });
      media.removeEventListener("change", resize);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);
  // Keep Tab inside the open drawer; closed off-screen links are inert on mobile.
  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab" || !menuOpen) return;
    const buttons = sidebarRef.current?.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    );
    const first = buttons?.[0];
    const last = buttons?.[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  return (
    <div className="app-shell">
      <aside
        className={`sidebar${menuOpen ? " open" : ""}`}
        id="sidebar"
        ref={sidebarRef}
        inert={mobile && !menuOpen}
        onKeyDown={trapFocus}
        aria-label="Application navigation"
      >
        <div className="brand">
          <img className="brand-mark" src="./icon.svg" alt="" />

          <div className="brand-copy">
            <p className="brand-title">PDF N-up</p>
            <p className="brand-subtitle">Local PDF imposition</p>
          </div>
        </div>

        <nav className="navigation" aria-label="Primary navigation">
          <button
            className={`nav-button${view === "convert" ? " active" : ""}`}
            type="button"
            data-view="convert"
            aria-current={view === "convert" ? "page" : undefined}
            onClick={() => navigate("convert")}
          >
            <span className="nav-icon" aria-hidden="true">
              01
            </span>
            <span>Convert</span>
          </button>

          <button
            className={`nav-button${view === "guide" ? " active" : ""}`}
            type="button"
            data-view="guide"
            aria-current={view === "guide" ? "page" : undefined}
            onClick={() => navigate("guide")}
          >
            <span className="nav-icon" aria-hidden="true">
              02
            </span>
            <span>How it works</span>
          </button>

          <button
            className={`nav-button${view === "privacy" ? " active" : ""}`}
            type="button"
            data-view="privacy"
            aria-current={view === "privacy" ? "page" : undefined}
            onClick={() => navigate("privacy")}
          >
            <span className="nav-icon" aria-hidden="true">
              03
            </span>
            <span>Privacy</span>
          </button>
        </nav>
      </aside>

      <button
        className={`sidebar-backdrop${menuOpen ? " visible" : ""}`}
        id="sidebarBackdrop"
        onClick={closeMenu}
        type="button"
        aria-label="Close navigation"
        tabIndex={-1}
      ></button>

      <div className="app-area" inert={menuOpen}>
        <header className="topbar">
          <button
            className="mobile-menu-button"
            id="mobileMenuButton"
            ref={menuButtonRef}
            onClick={() => setMenuOpen(!menuOpen)}
            type="button"
            aria-label="Open navigation"
            aria-controls="sidebar"
            aria-expanded={menuOpen}
          >
            ☰
          </button>

          <div className="page-heading">
            <h1 className="page-title" id="pageTitle">
              {pageTitles[view].title}
            </h1>
            <p className="page-description" id="pageDescription">
              {pageTitles[view].description}
            </p>
          </div>
        </header>

        <main>
          <section
            className={view === "convert" ? "view" : "view hidden"}
            id="view-convert"
            data-view-container="convert"
          >
            <article className="panel conversion-options">
              <div className="options-heading">
                <div>
                  <h2 className="panel-title">Conversion options</h2>
                  <p className="panel-subtitle">
                    Choose a layout and output size.
                  </p>
                </div>
              </div>
              <div className="panel-body options-body">
                <fieldset className="option-group">
                  <legend>Copies per sheet</legend>
                  <div className="layout-options" id="layoutOptions">
                    <label className="layout-option">
                      <input
                        type="radio"
                        name="layout"
                        value="2"
                        disabled={processing}
                        checked={options.layout.copies === 2}
                        onChange={() => changeOptions({ layout: LAYOUTS[2] })}
                      />
                      <span className="layout-card">
                        <svg
                          className="layout-diagram"
                          viewBox="0 0 48 36"
                          aria-hidden="true"
                        >
                          <rect x="1" y="1" width="46" height="34" />
                          <path d="M24 1v34" />
                        </svg>
                        <span>
                          <strong>2-up</strong>
                          <small>2×1</small>
                        </span>
                      </span>
                    </label>
                    <label className="layout-option">
                      <input
                        type="radio"
                        name="layout"
                        value="4"
                        disabled={processing}
                        checked={options.layout.copies === 4}
                        onChange={() => changeOptions({ layout: LAYOUTS[4] })}
                      />
                      <span className="layout-card">
                        <svg
                          className="layout-diagram"
                          viewBox="0 0 48 36"
                          aria-hidden="true"
                        >
                          <rect x="1" y="1" width="46" height="34" />
                          <path d="M24 1v34M1 18h46" />
                        </svg>
                        <span>
                          <strong>4-up</strong>
                          <small>2×2</small>
                        </span>
                      </span>
                    </label>
                    <label className="layout-option">
                      <input
                        type="radio"
                        name="layout"
                        value="8"
                        disabled={processing}
                        checked={options.layout.copies === 8}
                        onChange={() => changeOptions({ layout: LAYOUTS[8] })}
                      />
                      <span className="layout-card">
                        <svg
                          className="layout-diagram"
                          viewBox="0 0 48 36"
                          aria-hidden="true"
                        >
                          <rect x="1" y="1" width="46" height="34" />
                          <path d="M12.5 1v34M24 1v34M35.5 1v34M1 18h46" />
                        </svg>
                        <span>
                          <strong>8-up</strong>
                          <small>4×2</small>
                        </span>
                      </span>
                    </label>
                    <label className="layout-option">
                      <input
                        type="radio"
                        name="layout"
                        value="9"
                        disabled={processing}
                        checked={options.layout.copies === 9}
                        onChange={() => changeOptions({ layout: LAYOUTS[9] })}
                      />
                      <span className="layout-card">
                        <svg
                          className="layout-diagram"
                          viewBox="0 0 48 36"
                          aria-hidden="true"
                        >
                          <rect x="1" y="1" width="46" height="34" />
                          <path d="M16.33 1v34M31.67 1v34M1 12.33h46M1 23.67h46" />
                        </svg>
                        <span>
                          <strong>9-up</strong>
                          <small>3×3</small>
                        </span>
                      </span>
                    </label>
                    <label className="layout-option">
                      <input
                        type="radio"
                        name="layout"
                        value="16"
                        disabled={processing}
                        checked={options.layout.copies === 16}
                        onChange={() => changeOptions({ layout: LAYOUTS[16] })}
                      />
                      <span className="layout-card">
                        <svg
                          className="layout-diagram"
                          viewBox="0 0 48 36"
                          aria-hidden="true"
                        >
                          <rect x="1" y="1" width="46" height="34" />
                          <path d="M12.5 1v34M24 1v34M35.5 1v34M1 9.5h46M1 18h46M1 26.5h46" />
                        </svg>
                        <span>
                          <strong>16-up</strong>
                          <small>4×4</small>
                        </span>
                      </span>
                    </label>
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
                      onChange={() => changeOptions({ paperMode: "expand" })}
                    />
                    <span>
                      <strong>Expand paper size</strong>
                      <small>Keep every copy at its original size.</small>
                    </span>
                  </label>
                  <label className="size-option">
                    <input
                      type="radio"
                      name="paperMode"
                      value="same"
                      disabled={processing}
                      checked={options.paperMode === "same"}
                      onChange={() => changeOptions({ paperMode: "same" })}
                    />
                    <span>
                      <strong>Keep source page size</strong>
                      <small>
                        Scale copies to fit; vector content stays sharp.
                      </small>
                    </span>
                  </label>
                </fieldset>
                <fieldset className="option-group spacing-options">
                  <legend>Print spacing</legend>
                  <label htmlFor="marginMm">
                    Outer margin (mm)
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
                    Gap between copies (mm)
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
              </div>
            </article>
            <div className="workspace-grid">
              <article className="panel source-panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Source PDF</h2>
                    <p className="panel-subtitle">
                      Select one PDF containing exactly one page.
                    </p>
                  </div>
                </div>

                <div className="panel-body">
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: Drop events supplement the labelled file-picker buttons; this container is not a control. */}
                  <div
                    className={`drop-zone${source ? " has-file" : ""}${dragging ? " dragging" : ""}`}
                    id="dropZone"
                    onDragEnter={() => !processing && setDragging(true)}
                    onDragOver={() => !processing && setDragging(true)}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      setDragging(false);
                      void selectFiles(event.dataTransfer.files);
                    }}
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

                    <div className="drop-content">
                      <div className="document-icon" aria-hidden="true">
                        <div className="document-icon-grid">
                          <span></span>
                          <span></span>
                          <span></span>
                          <span></span>
                        </div>
                      </div>

                      <h2 className="drop-title" id="dropTitle">
                        {source?.name ?? "Drop a PDF here"}
                      </h2>

                      <p className="drop-description" id="dropDescription">
                        {source
                          ? `${formatBytes(source.size)} · one page validated`
                          : "Or select a file. Valid PDFs convert into an in-browser preview."}
                      </p>

                      <button
                        className="button drop-button"
                        id="selectFileButton"
                        disabled={processing}
                        onClick={() => fileInputRef.current?.click()}
                        type="button"
                      >
                        Select PDF
                      </button>

                      <p className="drop-restrictions">
                        PDF · ONE PAGE ONLY · MAXIMUM 50 MB
                      </p>
                    </div>

                    <section
                      className={
                        source ? "source-details" : "source-details hidden"
                      }
                      id="sourceDetails"
                      aria-labelledby="detailsTitle"
                    >
                      <div className="source-details-header">
                        <div>
                          <h3 id="detailsTitle">Document details</h3>
                          <span>
                            Drop another PDF here to replace this file
                          </span>
                        </div>
                        <button
                          className="button compact"
                          id="replaceFileButton"
                          disabled={processing}
                          onClick={() => fileInputRef.current?.click()}
                          type="button"
                        >
                          Replace PDF
                        </button>
                      </div>

                      <div
                        className={
                          source ? "empty-state hidden" : "empty-state"
                        }
                        id="detailsEmpty"
                      >
                        No PDF selected.
                      </div>

                      <dl
                        className={
                          source ? "summary-list" : "summary-list hidden"
                        }
                        id="detailsList"
                      >
                        <div className="summary-row">
                          <dt>Filename</dt>
                          <dd id="detailFilename">{source?.name ?? "—"}</dd>
                        </div>

                        <div className="summary-row">
                          <dt>File size</dt>
                          <dd id="detailFileSize">
                            {source ? formatBytes(source.size) : "—"}
                          </dd>
                        </div>

                        <div className="summary-row">
                          <dt>Source page</dt>
                          <dd id="detailSourceSize">
                            {source
                              ? formatPageSize(source.width, source.height)
                              : "—"}
                          </dd>
                        </div>

                        <div className="summary-row">
                          <dt>Output page</dt>
                          <dd id="detailOutputSize">
                            {source ? details.outputSize : "—"}
                          </dd>
                        </div>

                        <div className="summary-row">
                          <dt>Copy scale</dt>
                          <dd id="detailScale">
                            {source ? details.scale : "100%"}
                          </dd>
                        </div>
                        <div className="summary-row">
                          <dt>Layout</dt>
                          <dd id="detailLayout">
                            {source ? details.layout : "4-up (2×2)"}
                          </dd>
                        </div>
                      </dl>
                      <p
                        className={
                          source?.warnings.length
                            ? "source-warning"
                            : "source-warning hidden"
                        }
                        id="sourceWarning"
                        role="status"
                      >
                        {source?.warnings.join(" ")}
                      </p>
                    </section>
                  </div>

                  <div
                    className={`status-box ${status.type ?? "neutral"}`}
                    id="statusBox"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="status-content">
                      <div className="status-symbol" id="statusSymbol">
                        {status.loading ? (
                          <span className="spinner" aria-hidden="true" />
                        ) : (
                          (status.symbol ?? "i")
                        )}
                      </div>

                      <div>
                        <p className="status-title" id="statusTitle">
                          {status.title}
                        </p>
                        <p className="status-message" id="statusMessage">
                          {status.message}
                        </p>
                      </div>
                    </div>

                    <div
                      className={
                        status.loading || Number.isFinite(status.progress)
                          ? "progress-track"
                          : "progress-track hidden"
                      }
                      id="progressTrack"
                    >
                      <div
                        className={
                          status.loading && !Number.isFinite(status.progress)
                            ? "progress-bar indeterminate"
                            : "progress-bar"
                        }
                        id="progressBar"
                        style={{
                          width:
                            status.loading && !Number.isFinite(status.progress)
                              ? undefined
                              : `${Math.min(100, Math.max(0, status.progress ?? 0))}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                  <div className="document-actions">
                    <button
                      className="button compact"
                      id="clearDocumentButton"
                      type="button"
                      disabled={processing || !source}
                      onClick={clearDocument}
                    >
                      Clear document
                    </button>
                    <button
                      className={
                        processing ? "button compact" : "button compact hidden"
                      }
                      id="cancelButton"
                      onClick={clearDocument}
                      type="button"
                    >
                      Cancel processing
                    </button>
                    <button
                      className={
                        failed && source && options.paperMode !== "same"
                          ? "button compact"
                          : "button compact hidden"
                      }
                      id="useSourceSizeButton"
                      onClick={() => changeOptions({ paperMode: "same" })}
                      type="button"
                    >
                      Use source-page size
                    </button>
                  </div>
                </div>
              </article>

              <article className="panel output-panel" id="outputPanel">
                <div className="panel-header output-header">
                  <div>
                    <h2 className="panel-title">Output preview</h2>
                    <p className="panel-subtitle" id="outputSummary">
                      {output
                        ? `${output.filename} · ${formatBytes(output.size)} · held in memory`
                        : "Your generated PDF will appear here."}
                    </p>
                  </div>

                  <div className="output-actions">
                    <button
                      className="button"
                      id="openOutputButton"
                      type="button"
                      disabled={!output}
                      onClick={() => openOutput(false)}
                    >
                      Open
                    </button>
                    {output ? (
                      <a
                        className="button primary"
                        id="downloadOutputButton"
                        href={output.url}
                        download={output.filename}
                        aria-describedby="downloadHelp"
                        onClick={(event) => {
                          event.preventDefault();
                          void openOutput(true);
                        }}
                      >
                        Download
                      </a>
                    ) : (
                      <button
                        className="button primary"
                        id="downloadOutputButton"
                        type="button"
                        disabled
                      >
                        Download
                      </button>
                    )}
                  </div>
                </div>

                <Preview output={output} active={view === "convert"} />
                {output && (
                  <p className="preview-note" id="downloadHelp">
                    To save without opening in Firefox, right-click Download and
                    choose “Save Link As…” to select a filename and location.
                  </p>
                )}
                <p className="preview-note">
                  Preview only: images above 16 megapixels may be omitted. Open
                  the PDF to check it before printing. Print at actual size to
                  preserve the chosen dimensions.
                </p>
              </article>
            </div>
          </section>

          <section
            className={view === "guide" ? "view" : "view hidden"}
            id="view-guide"
            data-view-container="guide"
          >
            <div className="info-grid">
              <article className="info-card">
                <div className="info-number">01</div>
                <h2>Select one page</h2>
                <p>
                  Choose a PDF containing exactly one page. Encrypted,
                  password-protected, malformed and multi-page files are
                  rejected.
                </p>
              </article>

              <article className="info-card">
                <div className="info-number">02</div>
                <h2>Arrange the copies</h2>
                <p>
                  The page is embedded once and repeated in your chosen grid.
                  Vector content, text and images remain embedded as PDF
                  content.
                </p>
              </article>

              <article className="info-card">
                <div className="info-number">03</div>
                <h2>Preview and download locally</h2>
                <p>
                  The completed PDF is generated in browser memory and displayed
                  as a local preview. You choose whether to download or open it.
                  No source or output document is transmitted.
                </p>
              </article>
            </div>

            <article className="content-section guide-calculation">
              <h2>Page-size calculation</h2>
              <p>
                Expand paper size multiplies the source width by the number of
                columns and its height by the number of rows, keeping each copy
                at 100%. Keep source page size retains the visible dimensions
                and scales each copy uniformly to fit its grid cell.
              </p>
              <p>
                Outer margins and gaps between copies default to zero. Expanded
                paper adds the selected spacing without shrinking copies.
                Source-page size reserves that spacing before scaling the
                copies.
              </p>

              <span className="formula">
                expanded width = source width × columns &nbsp;&nbsp; expanded
                height = source height × rows
              </span>

              <span className="formula">
                same-paper scale = best proportional fit in the original or
                rotated sheet orientation
              </span>
            </article>

            <article className="content-section">
              <h2>Examples</h2>
              <ul>
                <li>4-up (2×2) on expanded paper doubles both dimensions.</li>
                <li>4-up on the source page uses four copies at 50% scale.</li>
                <li>8-up uses a four-column by two-row arrangement.</li>
                <li>
                  Rectangular layouts rotate the output sheet when that avoids
                  unused space.
                </li>
                <li>
                  Non-standard page dimensions are enlarged proportionally.
                </li>
                <li>
                  Visual page content is preserved, but interactive links,
                  annotations and form controls are not copied.
                </li>
              </ul>
            </article>
          </section>

          <section
            className={view === "privacy" ? "view" : "view hidden"}
            id="view-privacy"
            data-view-container="privacy"
          >
            <article className="content-section">
              <h2>Local-only document processing</h2>
              <p>
                Selected files are read by JavaScript in this browser tab. PDF
                parsing, page embedding, output construction, preview and
                download creation all occur on this device.
              </p>
            </article>

            <article className="content-section">
              <h2>No persistent history</h2>
              <p>
                The application does not retain conversion history, filenames,
                file sizes, completion times, source PDFs or generated PDFs in
                persistent browser storage.
              </p>
            </article>

            <article className="content-section">
              <h2>Browser and operating-system storage</h2>
              <p>
                Although this application does not save its own copy, your
                browser or operating system may temporarily write source or
                generated PDF data to disk while processing or previewing it.
                This may include a browser cache, a temporary directory such as
                <code>%TEMP%</code> on Windows, or virtual-memory files. The
                location and retention period are controlled by your browser and
                operating system.
              </p>
              <p>
                The completed PDF is only saved to your configured Downloads
                folder, or another location selected by you or your browser, if
                you choose Download.
              </p>
            </article>

            <article className="content-section">
              <h2>PDF libraries</h2>
              <p>
                PDF processing and preview use bundled, version-pinned copies of
                pdf-lib and PDF.js. All library files, fonts and image decoders
                load from this site. No third-party CDN requests are made.
              </p>
            </article>

            <article className="content-section">
              <h2>Memory lifecycle</h2>
              <p>
                Parsed document data remains in browser memory until the PDF is
                replaced, cleared or the page is closed. Clear document releases
                the source, output and preview. Cancel processing stops the
                current conversion and clears its document. Generated object
                URLs are revoked when they are no longer required.
              </p>
            </article>
          </section>
        </main>

        <footer>
          PDF N-up is open source under the MIT License.
          <a
            href="https://github.com/andygock/pdf-n-up"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
        </footer>
      </div>
    </div>
  );
}

interface SpacingInputProps {
  id: string;
  disabled: boolean;
  value: number;
  onCommit: (value: number) => void;
}

function SpacingInput({ id, disabled, value, onCommit }: SpacingInputProps) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    if (Number(draft) !== value) onCommit(Number(draft));
  };
  // Native change committed on blur. Keep an editable draft so typing a
  // multi-digit margin never starts conversion and disables the field midway.
  return (
    <input
      id={id}
      type="number"
      min="0"
      max="100"
      step="0.5"
      disabled={disabled}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}
