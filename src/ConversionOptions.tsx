import styles from "./ConversionOptions.module.css";
import { LAYOUTS } from "./geometry.ts";
import { SpacingInput } from "./SpacingInput.tsx";
import type { ConversionOptions as Options } from "./types.ts";
import ui from "./ui.module.css";

interface ConversionOptionsProps {
  options: Options;
  processing: boolean;
  changeOptions: (patch: Partial<Options>) => Promise<void>;
}
export function ConversionOptions({
  options,
  processing,
  changeOptions,
}: ConversionOptionsProps) {
  return (
    <section
      className={`${ui.panel} ${styles.conversionOptions}`}
      aria-label="Conversion options"
    >
      <fieldset className={styles.optionGroup}>
        <legend>Copies per sheet</legend>
        <div className={styles.layoutOptions} id="layoutOptions">
          {Object.values(LAYOUTS).map((layout) => (
            <label className={styles.layoutOption} key={layout.copies}>
              <input
                type="radio"
                name="layout"
                value={String(layout.copies)}
                disabled={processing}
                checked={options.layout.copies === layout.copies}
                onChange={() => void changeOptions({ layout })}
              />
              <span className={styles.layoutCard}>
                <svg
                  className={styles.layoutDiagram}
                  viewBox="0 0 48 36"
                  aria-hidden="true"
                >
                  <rect x="1" y="1" width="46" height="34" />
                  {Array.from({ length: layout.columns - 1 }, (_, column) => {
                    const x = 1 + ((column + 1) * 46) / layout.columns;
                    return <path key={`c${x}`} d={`M${x} 1v34`} />;
                  })}
                  {Array.from({ length: layout.rows - 1 }, (_, row) => {
                    const y = 1 + ((row + 1) * 34) / layout.rows;
                    return <path key={`r${y}`} d={`M1 ${y}h46`} />;
                  })}
                </svg>
                <strong>{layout.copies}-up</strong>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={`${styles.optionGroup} ${styles.sizeOptions}`}>
        <legend>Output paper</legend>
        <label className={styles.sizeOption}>
          <input
            type="radio"
            name="paperMode"
            value="expand"
            disabled={processing}
            checked={options.paperMode === "expand"}
            onChange={() => void changeOptions({ paperMode: "expand" })}
          />
          <span>
            <strong>Expand paper</strong>
            <small>Original-size copies</small>
          </span>
        </label>
        <label className={styles.sizeOption}>
          <input
            type="radio"
            name="paperMode"
            value="same"
            disabled={processing}
            checked={options.paperMode === "same"}
            onChange={() => void changeOptions({ paperMode: "same" })}
          />
          <span>
            <strong>Same paper</strong>
            <small>Scale copies to fit</small>
          </span>
        </label>
        {(["a4", "a3", "custom"] as const).map((paperMode) => (
          <label className={styles.sizeOption} key={paperMode}>
            <input
              type="radio"
              name="paperMode"
              disabled={processing}
              checked={options.paperMode === paperMode}
              onChange={() => void changeOptions({ paperMode })}
            />
            <span>
              <strong>
                {paperMode === "custom"
                  ? "Custom size"
                  : paperMode.toUpperCase()}
              </strong>
              <small>Best-fit orientation</small>
            </span>
          </label>
        ))}
        {options.paperMode === "custom" && (
          <div className={styles.spacingOptions}>
            <label htmlFor="paperWidthMm">
              Width (mm)
              <SpacingInput
                id="paperWidthMm"
                disabled={processing}
                value={options.paperWidthMm ?? 210}
                min={0.1}
                max={5080}
                onCommit={(paperWidthMm) =>
                  void changeOptions({ paperWidthMm })
                }
              />
            </label>
            <label htmlFor="paperHeightMm">
              Height (mm)
              <SpacingInput
                id="paperHeightMm"
                disabled={processing}
                value={options.paperHeightMm ?? 297}
                min={0.1}
                max={5080}
                onCommit={(paperHeightMm) =>
                  void changeOptions({ paperHeightMm })
                }
              />
            </label>
          </div>
        )}
      </fieldset>
      <fieldset className={`${styles.optionGroup} ${styles.spacingOptions}`}>
        <legend>Spacing (mm)</legend>
        <label>
          <input
            type="checkbox"
            checked={options.cropMarks ?? false}
            disabled={processing}
            onChange={(event) =>
              void changeOptions({ cropMarks: event.target.checked })
            }
          />
          Crop marks
        </label>
        {options.cropMarks && (
          <small>
            Reserves at least 5 mm margins and 10 mm gaps for cutting guides.
          </small>
        )}
        <label htmlFor="marginMm">
          Margin
          <SpacingInput
            id="marginMm"
            disabled={processing}
            value={options.marginMm ?? 0}
            onCommit={(value) => void changeOptions({ marginMm: value })}
          />
        </label>
        <label htmlFor="gutterMm">
          Gap
          <SpacingInput
            id="gutterMm"
            disabled={processing}
            value={options.gutterMm ?? 0}
            onCommit={(value) => void changeOptions({ gutterMm: value })}
          />
        </label>
      </fieldset>
    </section>
  );
}
