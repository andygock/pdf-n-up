import { printWarningSeverity } from "./print-warnings.ts";
import type { OutputSheet } from "./types.ts";
import ui from "./ui.module.css";

export function PrintWarningButton({
  sheets,
  filename,
  className,
  onClick,
}: {
  sheets: OutputSheet[];
  filename: string;
  className: string;
  onClick: () => void;
}) {
  const severity = printWarningSeverity(sheets, filename);
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`${severity === "danger" ? "High-priority warnings" : "Cautions"}: check before printing`}
    >
      <span
        aria-hidden="true"
        className={severity === "danger" ? ui.dangerGlyph : ui.warningGlyph}
      >
        {"\u26a0\ufe0e"}
      </span>{" "}
      Check before printing
    </button>
  );
}
