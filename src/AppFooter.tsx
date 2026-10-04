import styles from "./AppFooter.module.css";
import type { View } from "./useView.ts";

export function AppFooter({ view }: { view: View }) {
  return (
    <footer className={styles.footer}>
      <nav aria-label="Help and information">
        {(
          [
            ["guide", "How it works"],
            ["privacy", "Privacy"],
          ] as const
        ).map(([target, label]) => (
          <a
            key={target}
            href={`#view-${target}`}
            data-view={target}
            aria-current={view === target ? "page" : undefined}
          >
            {label}
          </a>
        ))}
        <a
          href="https://github.com/andygock/pdf-n-up"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub ↗
        </a>
      </nav>
    </footer>
  );
}
