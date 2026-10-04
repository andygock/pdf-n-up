import type { ReactNode } from "react";
import styles from "./ConversionOptions.module.css";
import { CustomGrid } from "./CustomGrid.tsx";
import { LAYOUTS } from "./geometry.ts";
import { SpacingInput } from "./SpacingInput.tsx";
import type { ConversionOptions as Options } from "./types.ts";
import ui from "./ui.module.css";

interface ConversionOptionsProps {
  children?: ReactNode;
  options: Options;
  processing: boolean;
  changeOptions: (patch: Partial<Options>) => Promise<void>;
}

export function ConversionOptions({
  children,
  options,
  processing,
  changeOptions,
}: ConversionOptionsProps) {
  return (
    <section
      className={styles.conversionOptions}
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
                checked={
                  !options.layout.custom &&
                  options.layout.copies === layout.copies
                }
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
        {options.layout.custom && (
          <CustomGrid
            layout={options.layout}
            disabled={processing}
            onCommit={(layout) => void changeOptions({ layout })}
          />
        )}
      </fieldset>

      <fieldset className={styles.optionGroup}>
        <legend>Output paper</legend>
        <select
          className={`${ui.control} ${styles.select}`}
          aria-label="Output paper"
          title="Expanded paper fits your copies. Fixed paper uses the best-fit orientation."
          disabled={processing}
          value={options.paperMode}
          onChange={(event) =>
            void changeOptions({
              paperMode: event.target.value as Options["paperMode"],
            })
          }
        >
          <option value="expand">Expand paper</option>
          <option value="same">Same as source</option>
          <option value="a4">A4 · 210 × 297 mm</option>
          <option value="a3">A3 · 297 × 420 mm</option>
          <option value="custom">Custom dimensions</option>
        </select>
        {options.paperMode === "custom" ? (
          <div className={styles.dimensionFields}>
            <label className={ui.field} htmlFor="paperWidthMm">
              Width{" "}
              <SpacingInput
                id="paperWidthMm"
                disabled={processing}
                value={options.paperWidthMm ?? 210}
                min={0.1}
                max={5080}
                onCommit={(paperWidthMm) =>
                  void changeOptions({ paperWidthMm })
                }
              />{" "}
              mm
            </label>
            <label className={ui.field} htmlFor="paperHeightMm">
              Height{" "}
              <SpacingInput
                id="paperHeightMm"
                disabled={processing}
                value={options.paperHeightMm ?? 297}
                min={0.1}
                max={5080}
                onCommit={(paperHeightMm) =>
                  void changeOptions({ paperHeightMm })
                }
              />{" "}
              mm
            </label>
          </div>
        ) : null}
      </fieldset>

      <fieldset className={styles.optionGroup}>
        <legend>Copy size</legend>
        <select
          className={`${ui.control} ${styles.select}`}
          id="scaleMode"
          aria-label="Copy sizing"
          title="Automatic keeps original size on expanded paper and scales to fit fixed paper."
          disabled={processing}
          value={options.scaleMode ?? "fit"}
          onChange={(event) =>
            void changeOptions({
              scaleMode: event.target.value as Options["scaleMode"],
            })
          }
        >
          <option value="fit">Automatic</option>
          <option value="percent">Exact percentage</option>
          <option value="dimensions">Exact dimensions</option>
        </select>
        {options.scaleMode === "percent" ? (
          <div className={styles.secondaryRow}>
            <label className={ui.field} htmlFor="scalePercent">
              Scale{" "}
              <SpacingInput
                id="scalePercent"
                disabled={processing}
                min={0.1}
                max={10000}
                value={options.scalePercent ?? 100}
                onCommit={(scalePercent) =>
                  void changeOptions({ scalePercent })
                }
              />{" "}
              %
            </label>
          </div>
        ) : options.scaleMode === "dimensions" ? (
          <>
            <div className={styles.dimensionFields}>
              <label className={ui.field} htmlFor="copyWidthMm">
                Width{" "}
                <SpacingInput
                  id="copyWidthMm"
                  disabled={processing}
                  min={0.1}
                  max={5080}
                  value={options.copyWidthMm ?? 90}
                  onCommit={(copyWidthMm) =>
                    void changeOptions({ copyWidthMm })
                  }
                />{" "}
                mm
              </label>
              <label className={ui.field} htmlFor="copyHeightMm">
                Height{" "}
                <SpacingInput
                  id="copyHeightMm"
                  disabled={processing}
                  min={0.1}
                  max={5080}
                  value={options.copyHeightMm ?? 50}
                  onCommit={(copyHeightMm) =>
                    void changeOptions({ copyHeightMm })
                  }
                />{" "}
                mm
              </label>
            </div>
            <p className={styles.hint}>
              Width and height stay linked to the source proportions.
            </p>
          </>
        ) : null}
      </fieldset>

      <fieldset className={styles.optionGroup}>
        <legend>Spacing · mm</legend>
        <div className={styles.fields}>
          <label className={ui.field} htmlFor="marginMm">
            Margin{" "}
            <SpacingInput
              id="marginMm"
              disabled={processing}
              value={options.marginMm ?? 0}
              onCommit={(value) => void changeOptions({ marginMm: value })}
            />
          </label>
          <label className={ui.field} htmlFor="gutterMm">
            Gap{" "}
            <SpacingInput
              id="gutterMm"
              disabled={processing}
              value={options.gutterMm ?? 0}
              onCommit={(value) => void changeOptions({ gutterMm: value })}
            />
          </label>
        </div>
      </fieldset>
      <div className={styles.toolbar}>
        <label className={ui.checkbox}>
          <input
            type="checkbox"
            disabled={processing}
            checked={options.layout.custom ?? false}
            onChange={(event) =>
              void changeOptions({
                layout: event.target.checked
                  ? { ...options.layout, custom: true }
                  : LAYOUTS[4],
              })
            }
          />
          Custom grid
        </label>
        <label
          className={ui.checkbox}
          title="Reserves at least 5 mm margins and 10 mm gaps for cutting guides."
        >
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
        {children}
      </div>
    </section>
  );
}
