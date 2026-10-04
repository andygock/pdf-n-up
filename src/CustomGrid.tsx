import { useEffect, useState } from "react";
import styles from "./ConversionOptions.module.css";
import type { Layout } from "./types.ts";
import ui from "./ui.module.css";

interface CustomGridProps {
  layout: Layout;
  disabled: boolean;
  onCommit: (layout: Layout) => void;
}

export function CustomGrid({ layout, disabled, onCommit }: CustomGridProps) {
  const [draft, setDraft] = useState({
    columns: String(layout.columns),
    rows: String(layout.rows),
  });

  useEffect(() => {
    setDraft({ columns: String(layout.columns), rows: String(layout.rows) });
  }, [layout.columns, layout.rows]);

  const columns = Number(draft.columns);
  const rows = Number(draft.rows);
  const valid =
    [columns, rows].every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 20,
    ) && columns * rows <= 100;

  useEffect(() => {
    if (
      disabled ||
      !valid ||
      (columns === layout.columns && rows === layout.rows)
    )
      return;

    // Commit both axes together so a conversion cannot discard a second edit.
    const timer = setTimeout(() => {
      onCommit({ columns, rows, copies: columns * rows, custom: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [columns, rows, valid, disabled, layout.columns, layout.rows, onCommit]);

  return (
    <>
      <div className={styles.fields}>
        {(["columns", "rows"] as const).map((axis) => (
          <label className={ui.field} key={axis} htmlFor={axis}>
            {axis === "columns" ? "Columns" : "Rows"}
            <input
              className={ui.control}
              id={axis}
              type="number"
              min={1}
              max={20}
              step={1}
              value={draft[axis]}
              disabled={disabled}
              aria-invalid={!valid}
              aria-describedby="customGridHint"
              onChange={(event) => {
                const value = event.target.value;
                setDraft((current) => ({ ...current, [axis]: value }));
              }}
            />
          </label>
        ))}
      </div>
      <p className={styles.hint} id="customGridHint" role="status">
        {valid
          ? "Updates automatically. Up to 20 per axis, 100 copies."
          : "Enter 1–20 rows and columns, with no more than 100 copies."}
      </p>
    </>
  );
}
