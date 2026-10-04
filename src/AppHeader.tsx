import type { ReactNode } from "react";
import styles from "./AppHeader.module.css";

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className={styles.topbar}>
      <a
        className={styles.brand}
        href="#view-convert"
        aria-label="PDF N-up — back to converter"
      >
        <img className={styles.brandMark} src="./icon.svg" alt="" />
        <span className={styles.brandTitle}>PDF N-up</span>
      </a>
      {children}
    </header>
  );
}
