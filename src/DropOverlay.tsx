import styles from "./DropOverlay.module.css";

export function DropOverlay({ hasSource }: { hasSource: boolean }) {
  return (
    <div id="dropOverlay" className={styles.dropOverlay} role="status">
      <div>
        <strong>
          {hasSource
            ? "Drop to replace your PDF or start a batch"
            : "Drop one or more PDFs anywhere"}
        </strong>
        <span>Multiple PDFs create a batch · up to 50 MB per file</span>
      </div>
    </div>
  );
}
