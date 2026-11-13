import { type ReactNode, useState } from "react";

import styles from "./ConversionOptions.module.css";

import { CustomGrid } from "./CustomGrid.tsx";

import { LAYOUTS } from "./geometry.ts";

import { Modal } from "./Modal.tsx";

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
  const [markBehaviour, setMarkBehaviour] = useState(
    options.cropMarkBehaviour ?? "fit",
  );

  const [marksToEdge, setMarksToEdge] = useState(
    options.cropMarksToEdge ?? false,
  );
  const [configure, setConfigure] = useState<"paper" | "copy" | null>(null);

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
                  !options.autoLayout &&
                  !options.layout.custom &&
                  options.layout.copies === layout.copies
                }
                onChange={() =>
                  void changeOptions({
                    layout,

                    autoLayout: false,

                    rotateCopies: false,
                  })
                }
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

      <fieldset className={styles.optionGroup}>
        <legend>Output paper</legend>
        <div className={styles.paperControls}>
          <select
            className={`${ui.control} ${styles.select}`}
            aria-label="Output paper"
            title="Expanded paper fits your copies. Fixed paper uses the best-fit orientation."
            disabled={processing}
            value={options.paperMode}
            onChange={(event) => {
              setConfigure(event.target.value === "custom" ? "paper" : null);
              void changeOptions({
                paperMode: event.target.value as Options["paperMode"],
              });
            }}
          >
            <option value="expand">Expand paper</option>
            <option value="same">Same as source</option>
            <option value="a4">A4 · 210 × 297 mm</option>
            <option value="a3">A3 · 297 × 420 mm</option>
            <option value="custom">Custom dimensions</option>
          </select>
          <select
            className={`${ui.control} ${styles.select}`}
            aria-label="Output rotation"
            title="Rotate the entire output sheet, including the saved PDF"
            disabled={processing}
            value={options.outputRotation ?? 0}
            onChange={(event) =>
              void changeOptions({
                outputRotation: Number(
                  event.target.value,
                ) as Options["outputRotation"],
              })
            }
          >
            <option value={0}>↻ 0°</option>
            <option value={90}>↻ 90°</option>
            <option value={180}>↻ 180°</option>
            <option value={270}>↺ 90°</option>
          </select>
        </div>
        {options.paperMode === "custom" ? (
          <Modal
            defaultOpen={configure === "paper"}
            title={`Paper: ${options.paperWidthMm ?? 210} × ${options.paperHeightMm ?? 297} mm`}
            triggerClassName={`${ui.button} ${ui.compact} ${ui.quiet}`}
          >
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
          </Modal>
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
          onChange={(event) => {
            setConfigure(event.target.value === "fit" ? null : "copy");
            void changeOptions({
              scaleMode: event.target.value as Options["scaleMode"],
            });
          }}
        >
          <option value="fit">Automatic</option>
          <option value="percent">Exact percentage</option>
          <option value="dimensions">Exact dimensions</option>
        </select>
        {options.scaleMode && options.scaleMode !== "fit" && (
          <Modal
            key={options.scaleMode}
            defaultOpen={configure === "copy"}
            title={
              options.scaleMode === "percent"
                ? `Scale: ${options.scalePercent ?? 100}%`
                : `Copy: ${options.dimensionAxis === "height" ? `${options.copyHeightMm ?? 50} mm high` : `${options.copyWidthMm ?? 90} mm wide`}`
            }
            triggerClassName={`${ui.button} ${ui.compact} ${ui.quiet}`}
          >
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
                  {options.dimensionAxis === "height" ? "Height" : "Width"}{" "}
                  stays fixed; the other dimension follows each source page's
                  proportions.
                </p>
              </>
            ) : null}
          </Modal>
        )}
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
              onCommit={(value) =>
                void changeOptions({
                  marginMm: value,

                  marginTopMm: undefined,

                  marginRightMm: undefined,

                  marginBottomMm: undefined,

                  marginLeftMm: undefined,
                })
              }
            />
          </label>
          <label className={ui.field} htmlFor="gutterMm">
            Gap{" "}
            <SpacingInput
              id="gutterMm"
              disabled={processing}
              value={options.gutterMm ?? 0}
              onCommit={(value) =>
                void changeOptions({
                  gutterMm: value,

                  gapHorizontalMm: undefined,

                  gapVerticalMm: undefined,
                })
              }
            />
          </label>
        </div>
      </fieldset>
      {[
        options.marginTopMm,
        options.marginRightMm,
        options.marginBottomMm,
        options.marginLeftMm,
        options.gapHorizontalMm,
        options.gapVerticalMm,
      ].some((value) => value !== undefined) && (
        <p className={styles.hint}>
          Margins (top / right / bottom / left):{" "}
          {[
            options.marginTopMm,
            options.marginRightMm,
            options.marginBottomMm,
            options.marginLeftMm,
          ]
            .map((value) => value ?? options.marginMm ?? 0)
            .join(" / ")}{" "}
          mm. Gaps (horizontal / vertical):{" "}
          {options.gapHorizontalMm ?? options.gutterMm ?? 0} /{" "}
          {options.gapVerticalMm ?? options.gutterMm ?? 0} mm.
        </p>
      )}
      <div className={styles.toolbar}>
        <Modal
          title={`Spacing details${[options.marginTopMm, options.marginRightMm, options.marginBottomMm, options.marginLeftMm, options.gapHorizontalMm, options.gapVerticalMm].some((value) => value !== undefined) ? ": custom" : ""}`}
          triggerClassName={`${ui.button} ${ui.compact} ${ui.quiet}`}
        >
          <p>
            Set individual edges and gaps in millimetres. The main Margin and
            Gap controls reset their individual values.
          </p>
          <div className={styles.advancedFields}>
            {(
              [
                ["marginTopMm", "Top margin"],

                ["marginRightMm", "Right margin"],

                ["marginBottomMm", "Bottom margin"],

                ["marginLeftMm", "Left margin"],

                ["gapHorizontalMm", "Horizontal gap"],

                ["gapVerticalMm", "Vertical gap"],
              ] as const
            ).map(([key, label]) => (
              <label className={ui.field} key={key} htmlFor={key}>
                {label}
                <SpacingInput
                  id={key}
                  disabled={processing}
                  value={
                    options[key] ??
                    (key.startsWith("margin")
                      ? (options.marginMm ?? 0)
                      : (options.gutterMm ?? 0))
                  }
                  onCommit={(value) => void changeOptions({ [key]: value })}
                />{" "}
                mm
              </label>
            ))}
          </div>
          <p className={styles.hint}>
            Crop marks reserve at least 5 mm at each edge and 10 mm between
            copies.
          </p>
        </Modal>
        <Modal
          title={
            options.autoLayout
              ? "Layout: auto"
              : options.layout.custom
                ? `Custom: ${options.layout.columns} × ${options.layout.rows}`
                : "Layout details"
          }
          triggerClassName={`${ui.button} ${ui.compact} ${ui.quiet}`}
        >
          <div className={styles.advancedFields}>
            <label className={ui.checkbox}>
              <input
                type="checkbox"
                disabled={processing}
                checked={options.autoLayout ?? false}
                onChange={(event) =>
                  void changeOptions({
                    autoLayout: event.target.checked,

                    rotateCopies: false,

                    ...(event.target.checked && options.paperMode === "expand"
                      ? { paperMode: "a4" as const }
                      : {}),

                    ...(event.target.checked &&
                    (!options.scaleMode || options.scaleMode === "fit")
                      ? { scaleMode: "dimensions" as const }
                      : {}),
                  })
                }
              />
              Fit as many as possible
            </label>
            <p>
              Preserves the copy size and chooses a grid and artwork orientation
              for fixed paper. Up to 100 copies per sheet, with at most 20 rows
              or columns.
            </p>
            <label className={ui.checkbox}>
              <input
                type="checkbox"
                disabled={processing || options.autoLayout}
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
            {!options.autoLayout && options.layout.custom && (
              <CustomGrid
                layout={options.layout}
                disabled={processing}
                onCommit={(layout) => void changeOptions({ layout })}
              />
            )}
            <label className={ui.checkbox}>
              <input
                type="checkbox"
                disabled={processing || options.autoLayout}
                checked={options.rotateCopies ?? false}
                onChange={(event) =>
                  void changeOptions({ rotateCopies: event.target.checked })
                }
              />
              Rotate artwork 90 degrees
            </label>
          </div>
        </Modal>
        <Modal
          title="Crop marks"
          trigger={(open) => {
            const configure = () => {
              setMarkBehaviour(options.cropMarkBehaviour ?? "fit");

              setMarksToEdge(options.cropMarksToEdge ?? false);

              open();
            };

            return (
              <>
                <label className={ui.checkbox}>
                  <input
                    type="checkbox"
                    checked={options.cropMarks ?? false}
                    disabled={processing}
                    onChange={(event) => {
                      if (event.target.checked) configure();
                      else void changeOptions({ cropMarks: false });
                    }}
                  />
                  Crop marks
                </label>
                {options.cropMarks && (
                  <button
                    type="button"
                    className={`${ui.button} ${ui.compact} ${ui.quiet}`}
                    disabled={processing}
                    onClick={configure}
                  >
                    Crop mark options
                  </button>
                )}
              </>
            );
          }}
        >
          {(close) => (
            <div className={styles.advancedFields}>
              <p>
                Reserve at least 5 mm at each edge and 10 mm between copies for
                cutting guides.
              </p>
              <fieldset className={styles.optionGroup}>
                <legend>Paper and copy size</legend>
                <label className={ui.checkbox}>
                  <input
                    type="radio"
                    name="cropMarkBehaviour"
                    value="expand"
                    checked={markBehaviour === "expand"}
                    disabled={processing}
                    onChange={() => setMarkBehaviour("expand")}
                  />
                  Preserve copy scale — enlarge paper
                </label>
                <p className={styles.hint}>
                  Keep the copy sizes and grid calculated without crop marks.
                  Add only the extra space needed for marks; the saved sheet may
                  be larger than the selected paper.
                </p>
                <label className={ui.checkbox}>
                  <input
                    type="radio"
                    name="cropMarkBehaviour"
                    value="fit"
                    checked={markBehaviour === "fit"}
                    disabled={processing}
                    onChange={() => setMarkBehaviour("fit")}
                  />
                  Fit marks on selected paper
                </label>
                <p className={styles.hint}>
                  Automatic sizing may shrink copies or fit fewer copies with
                  automatic packing. Exact sizes report an error if they cannot
                  fit. Expanded paper grows as usual.
                </p>
              </fieldset>
              <label className={ui.checkbox}>
                <input
                  type="checkbox"
                  checked={marksToEdge}
                  disabled={processing}
                  onChange={(event) => setMarksToEdge(event.target.checked)}
                />
                Extend marks to paper edges
              </label>
              <p className={styles.hint}>
                Longer guides help align guillotine cuts. Lines stop before
                neighbouring artwork. Printers may leave an unprinted border.
              </p>
              <button
                type="button"
                className={ui.button}
                disabled={processing}
                onClick={() => {
                  void changeOptions({
                    cropMarks: true,

                    cropMarkBehaviour: markBehaviour,

                    cropMarksToEdge: marksToEdge,
                  });

                  close();
                }}
              >
                Apply crop marks
              </button>
            </div>
          )}
        </Modal>
        <Modal
          title={`Bleed / trim: ${options.bleedMm ?? 0} mm${options.sourceBox === "trim" ? " · TrimBox" : ""}`}
          triggerClassName={`${ui.button} ${ui.compact} ${ui.quiet}`}
        >
          <label className={ui.field}>
            Finished source area
            <select
              className={ui.control}
              disabled={processing}
              value={options.sourceBox ?? "visible"}
              onChange={(event) =>
                void changeOptions({
                  sourceBox: event.target.value as Options["sourceBox"],
                })
              }
            >
              <option value="visible">Visible page (CropBox)</option>
              <option value="trim">Source TrimBox</option>
            </select>
          </label>
          <label className={ui.field} htmlFor="bleedMm">
            Bleed per edge · mm
            <SpacingInput
              id="bleedMm"
              disabled={processing}
              value={options.bleedMm ?? 0}
              max={20}
              onCommit={(bleedMm) => void changeOptions({ bleedMm })}
            />
          </label>
          <p>
            Finished dimensions refer to the selected source area. Bleed uses
            available source artwork beyond that area; missing artwork is never
            invented. Margins and gaps reserve space for bleed. Crop marks
            indicate the finished trim.
          </p>
          <p>
            The PDF stores sheet-wide TrimBox and BleedBox envelopes. Each
            copy’s trim is indicated by crop marks when enabled.
          </p>
        </Modal>
        {children}
      </div>
    </section>
  );
}
