import styles from "./Help.module.css";
import type { View } from "./useView.ts";

export function Help({ view }: { view: View }) {
  return (
    <>
      <section
        hidden={view !== "guide"}
        id="view-guide"
        data-view-container="guide"
      >
        <div className={styles.infoGrid}>
          <article className={styles.infoCard}>
            <div className={styles.infoNumber}>01</div>
            <h2>Select one page</h2>
            <p>
              Choose a PDF, then select the page to repeat. Encrypted,
              password-protected and malformed files are rejected.
            </p>
          </article>

          <article className={styles.infoCard}>
            <div className={styles.infoNumber}>02</div>
            <h2>Arrange the copies</h2>
            <p>
              The page is embedded once and repeated in your chosen grid. Vector
              content, text and images remain embedded as PDF content.
            </p>
          </article>

          <article className={styles.infoCard}>
            <div className={styles.infoNumber}>03</div>
            <h2>Preview and download locally</h2>
            <p>
              The completed PDF is generated in browser memory and displayed as
              a local preview. You choose whether to download or open it. No
              source or output document is transmitted.
            </p>
          </article>
        </div>

        <article
          className={`${styles.contentSection} ${styles.guideCalculation}`}
        >
          <h2>Page-size calculation</h2>
          <p>
            Choose expanded paper, source-sized paper, A4, A3 or custom
            dimensions. Automatic sizing keeps copies at 100% on expanded paper
            and fits them proportionally onto fixed paper. Exact percentage and
            dimension modes retain the requested size and report when the sheet
            is too small.
          </p>
          <p>
            Outer margins and gaps between copies default to zero. Expanded
            paper adds the selected spacing without shrinking copies. Fixed
            paper reserves that spacing before scaling the copies. Crop marks
            reserve at least 5 mm margins and 10 mm gaps.
          </p>

          <span className={styles.formula}>
            expanded width = copy width × columns + 2 × margin + (columns − 1) ×
            gap
            <br />
            expanded height = copy height × rows + 2 × margin + (rows − 1) × gap
          </span>

          <span className={styles.formula}>
            fixed-paper scale = best proportional fit in the original or rotated
            sheet orientation
          </span>
        </article>

        <article className={styles.contentSection}>
          <h2>Examples</h2>
          <ul>
            <li>
              4-up (2×2) on expanded paper at 100%, without spacing, doubles
              both dimensions.
            </li>
            <li>
              4-up on the source page with automatic sizing and no spacing uses
              four copies at 50% scale.
            </li>
            <li>8-up uses a four-column by two-row arrangement.</li>
            <li>
              Preset rectangular grids transpose for landscape source pages.
              Custom grids retain your chosen rows and columns.
            </li>
            <li>Non-standard page dimensions are enlarged proportionally.</li>
            <li>
              Visual page content is preserved, but interactive links,
              annotations and form controls are not copied.
            </li>
          </ul>
        </article>
        <article className={styles.contentSection}>
          <h2>Batch conversion</h2>
          <p>
            Choose batch PDFs or drop multiple files, select a page number for
            each, then choose Convert batch. Up to 20 files and 100 MB of input
            are accepted; each file is limited to 50 MB. Results are limited to
            100 MB combined. Failed files are listed individually. Save
            completed PDFs separately or download the ZIP. Changing settings
            requires running the batch again.
          </p>
          <p>
            Show measurements overlays copy dimensions, minimum margins and cell
            gaps on the preview only. Print the saved PDF at actual size.
          </p>
        </article>
      </section>

      <section
        hidden={view !== "privacy"}
        id="view-privacy"
        data-view-container="privacy"
      >
        <article className={styles.contentSection}>
          <h2>Local-only document processing</h2>
          <p>
            Selected files are read by JavaScript in this browser tab. PDF
            parsing, page embedding, output construction, preview and download
            creation all occur on this device.
          </p>
        </article>

        <article className={styles.contentSection}>
          <h2>Optional settings, no document history</h2>
          <p>
            You can opt in to remember layout settings on this device and remove
            them with Reset settings. The application does not retain conversion
            history, filenames, file sizes, completion times, source PDFs or
            generated PDFs in persistent browser storage.
          </p>
        </article>

        <article className={styles.contentSection}>
          <h2>Browser and operating-system storage</h2>
          <p>
            Although this application does not save its own copy, your browser
            or operating system may temporarily write source or generated PDF
            data to disk while processing or previewing it. This may include a
            browser cache, a temporary directory such as
            <code>%TEMP%</code> on Windows, or virtual-memory files. The
            location and retention period are controlled by your browser and
            operating system.
          </p>
          <p>
            The completed PDF is only saved to your configured Downloads folder,
            or another location selected by you or your browser, if you choose
            Download or Save in the PDF viewer.
          </p>
        </article>

        <article className={styles.contentSection}>
          <h2>PDF libraries</h2>
          <p>
            PDF processing and preview use bundled, version-pinned copies of
            pdf-lib and PDF.js. All library files, fonts and image decoders load
            from this site. No third-party CDN requests are made.
          </p>
        </article>

        <article className={styles.contentSection}>
          <h2>Memory lifecycle</h2>
          <p>
            Parsed document data remains in browser memory until the PDF is
            replaced, cleared or the page is closed. Clear document releases the
            source, output and preview. Cancel processing stops the current
            conversion and clears its document. Generated object URLs are
            revoked when they are no longer required.
          </p>
        </article>
      </section>
    </>
  );
}
