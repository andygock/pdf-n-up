import type { Ref } from "react";
import { pageTitles } from "./format.ts";
import styles from "./PageHeading.module.css";
import ui from "./ui.module.css";
import type { View } from "./useView.ts";

interface PageHeadingProps {
  view: View;
  compact: boolean;
  headingRef: Ref<HTMLHeadingElement>;
}
export function PageHeading({ view, compact, headingRef }: PageHeadingProps) {
  return (
    <div
      className={`${styles.pageHeading} ${compact ? styles.compactHeading : ""}`}
    >
      <div>
        <h1
          className={styles.pageTitle}
          id="pageTitle"
          ref={headingRef}
          tabIndex={-1}
        >
          {pageTitles[view].title}
        </h1>
        {!compact && (
          <p className={styles.pageDescription} id="pageDescription">
            {pageTitles[view].description}
          </p>
        )}
      </div>
      {view !== "convert" && (
        <a
          className={`${ui.button} ${ui.compact}`}
          href="#view-convert"
          data-view="convert"
        >
          ← Back to PDF
        </a>
      )}
    </div>
  );
}
