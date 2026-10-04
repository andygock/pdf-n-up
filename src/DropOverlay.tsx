import styles from "./DropOverlay.module.css";

export function DropOverlay({ hasSource }: { hasSource: boolean }) {
  return (
    <div id="dropOverlay" className={styles.dropOverlay} role="status">
      <div>
        <strong>
          {hasSource ? "Drop to replace your PDF" : "Drop your PDF anywhere"}
        </strong>
        <span>One page · up to 50 MB</span>
      </div>
    </div>
  );
}
