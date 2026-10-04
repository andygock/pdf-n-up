import styles from "./AppHeader.module.css";

export function AppHeader() {
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
    </header>
  );
}
