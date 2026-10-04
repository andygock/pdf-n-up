import { useMemo, useState } from "react";
import { Modal } from "./Modal.tsx";
import styles from "./OutputPanel.module.css";
import { summarisePrint } from "./print-summary.ts";
import type { OutputSheet } from "./types.ts";
import ui from "./ui.module.css";

function CopySizeDetails({
  variants,
}: {
  variants: { size: string; scale: string; count: number }[];
}) {
  const [page, setPage] = useState(0);
  const perPage = 20;
  return (
    <>
      <table className={styles.sizesTable}>
        <thead>
          <tr>
            <th>Finished size</th>
            <th>Scale</th>
            <th>Copies</th>
          </tr>
        </thead>
        <tbody>
          {variants.slice(page * perPage, (page + 1) * perPage).map((item) => (
            <tr key={`${item.size}/${item.scale}`}>
              <td>{item.size}</td>
              <td>{item.scale}</td>
              <td>{item.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {variants.length > perPage && (
        <nav className={styles.outputActions} aria-label="Copy sizes">
          <button
            type="button"
            className={`${ui.button} ${ui.compact}`}
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            {page + 1} / {Math.ceil(variants.length / perPage)}
          </span>
          <button
            type="button"
            className={`${ui.button} ${ui.compact}`}
            disabled={(page + 1) * perPage >= variants.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </>
  );
}

export function PrintSummary({ sheets }: { sheets: OutputSheet[] }) {
  const summary = useMemo(() => summarisePrint(sheets), [sheets]);
  if (!summary) return null;
  return (
    <section className={styles.printSummary} aria-label="Print summary">
      <h2 className={styles.panelTitle}>
        Sheet {summary.paper}{" "}
        <span className={styles.summaryMeta}>
          {" "}
          / {summary.capacity} per sheet
        </span>
      </h2>
      <div className={styles.summaryLine}>
        {summary.variants.length > 1 ? (
          <Modal title={summary.copySize} triggerClassName={styles.summaryLink}>
            {() => <CopySizeDetails variants={summary.variants} />}
          </Modal>
        ) : (
          <span>Copy {summary.copySize}</span>
        )}
        <span>{summary.scale} scale</span>
        <span>
          {summary.copies} copies on {summary.sheetCount}{" "}
          {summary.sheetCount === 1 ? "sheet" : "sheets"}
        </span>
        {summary.unused > 0 && (
          <span>
            {summary.unused} unused {summary.unused === 1 ? "cell" : "cells"} on
            last sheet
          </span>
        )}
      </div>
    </section>
  );
}
