import styles from "./DropOverlay.module.css";

export function DropOverlay({ hasSource }: { hasSource: boolean }) {
  return (
    <div id="dropOverlay" className={styles.dropOverlay} role="status">
      <div>
        <strong>
          {hasSource
            ? "Drop to replace your file or start a batch"
            : "Drop PDFs or images anywhere"}
        </strong>
        <span>
          PDF, JPEG or PNG · Multiple files create a batch · up to 50 MB per
          file
        </span>
      </div>
    </div>
  );
}
