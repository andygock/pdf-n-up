import type { Ref } from "react";
import { pageTitles } from "./format.ts";
import styles from "./PageHeading.module.css";
import ui from "./ui.module.css";
import type { View } from "./useView.ts";

interface PageHeadingProps {
  view: View;
  headingRef: Ref<HTMLHeadingElement>;
}
export function PageHeading({ view, headingRef }: PageHeadingProps) {
  if (view === "convert") return null;

  return (
    <div className={styles.pageHeading}>
      <div>
        <h1
          className={styles.pageTitle}
          id="pageTitle"
          ref={headingRef}
          tabIndex={-1}
        >
          {pageTitles[view].title}
        </h1>
        <p className={styles.pageDescription} id="pageDescription">
          {pageTitles[view].description}
        </p>
      </div>
      <a
        className={`${ui.button} ${ui.compact}`}
        href="#view-convert"
        data-view="convert"
      >
        ← Back to PDF
      </a>
    </div>
  );
}
