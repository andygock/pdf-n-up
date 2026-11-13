import styles from "./App.module.css";
import { AppFooter } from "./AppFooter.tsx";
import { AppHeader } from "./AppHeader.tsx";
import { BatchPanel } from "./BatchPanel.tsx";
import { ConversionFeedback } from "./ConversionFeedback.tsx";
import { ConversionOptions } from "./ConversionOptions.tsx";
import { DropOverlay } from "./DropOverlay.tsx";
import { Help } from "./Help.tsx";
import { OutputPanel } from "./OutputPanel.tsx";
import { PageHeading } from "./PageHeading.tsx";
import { PageOptions } from "./PageOptions.tsx";
import { SourcePicker } from "./SourcePicker.tsx";
import ui from "./ui.module.css";
import { useBatch } from "./useBatch.ts";
import { useConversion } from "./useConversion.ts";
import { useFileDrop } from "./useFileDrop.ts";
import { useView } from "./useView.ts";

export default function App() {
  const conversion = useConversion();
  const {
    source,
    output,
    options,
    processing: converting,
    status,
    failed,
    details,
    selectFiles: selectSingleFile,
    changeOptions,
    clearDocument,
    openOutput,
  } = conversion;
  const batch = useBatch();
  const processing = converting || batch.processing;
  const selectFiles = async (files: FileList | File[] | null) => {
    if (processing) return;
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    if (selected.length > 1) {
      if (batch.selectFiles(selected)) {
        const replacing = !!source;
        clearDocument();
        if (replacing)
          await changeOptions({
            pageRange: "",
            quantity: undefined,
            fillLastSheet: false,
          });
      }
    } else {
      if (
        await selectSingleFile(selected, !!source || batch.entries.length > 0)
      )
        batch.clear();
    }
  };
  const { view, setView, headingRef, mainRef } = useView();
  const dragging = useFileDrop(processing, selectFiles, setView);
  return (
    <div className={styles.appShell}>
      {dragging && <DropOverlay hasSource={!!source} />}
      <AppHeader>
        {source && view === "convert" && (
          <SourcePicker
            source={source}
            processing={processing}
            dragging={dragging}
            onSelectFiles={selectFiles}
            onClear={
              batch.processing
                ? batch.cancel
                : converting
                  ? conversion.cancel
                  : clearDocument
            }
            compact
          />
        )}
      </AppHeader>
      <main className={styles.main} ref={mainRef}>
        <PageHeading view={view} headingRef={headingRef} />
        <section
          hidden={view !== "convert"}
          className={styles.converterView}
          id="view-convert"
          data-view-container="convert"
        >
          <div className={styles.converter}>
            {!source && (
              <SourcePicker
                source={source}
                processing={processing}
                dragging={dragging}
                onSelectFiles={selectFiles}
                onClear={
                  batch.processing
                    ? batch.cancel
                    : converting
                      ? conversion.cancel
                      : clearDocument
                }
              />
            )}
            <div className={`${ui.panel} ${styles.settingsPanel}`}>
              <ConversionOptions
                options={options}
                processing={conversion.loading || batch.processing}
                changeOptions={changeOptions}
              >
                <PageOptions
                  key={conversion.settingsReset}
                  source={source}
                  sourceFile={conversion.sourceFile}
                  options={options}
                  processing={conversion.loading || batch.processing}
                  changeOptions={changeOptions}
                  selectPage={conversion.selectPage}
                  applyPages={conversion.applyPages}
                />
                <div className={styles.preferences}>
                  <label className={ui.checkbox}>
                    <input
                      type="checkbox"
                      checked={conversion.rememberSettings}
                      disabled={conversion.loading || batch.processing}
                      onChange={(event) =>
                        conversion.setRememberSettings(event.target.checked)
                      }
                    />
                    Remember settings on this device
                  </label>
                  <button
                    type="button"
                    disabled={conversion.loading || batch.processing}
                    className={`${ui.button} ${ui.compact} ${ui.quiet}`}
                    onClick={() => void conversion.resetSettings()}
                  >
                    Reset settings
                  </button>
                  {conversion.preferenceError && (
                    <p role="status">
                      Could not save preferences: {conversion.preferenceError}
                    </p>
                  )}
                </div>
              </ConversionOptions>
            </div>
            {batch.entries.length === 0 && (
              <ConversionFeedback
                recovery={conversion.recovery}
                source={source}
                output={output}
                options={options}
                processing={processing}
                status={status}
                failed={failed}
                details={details}
                changeOptions={changeOptions}
              />
            )}
            {(source || converting) && (
              <OutputPanel
                documentKey={conversion.sourceFile}
                current={conversion.outputCurrent}
                output={output}
                active={view === "convert"}
                openOutput={openOutput}
              />
            )}
            {source && !conversion.outputCurrent && !processing && (
              <button
                type="button"
                className={ui.button}
                onClick={() => void conversion.retry()}
              >
                Retry output
              </button>
            )}
            {batch.entries.length > 0 ? (
              <BatchPanel
                batch={batch}
                options={options}
                disabled={processing}
              />
            ) : batch.message ? (
              <p className={styles.batchMessage} role="status">
                {batch.message}
              </p>
            ) : null}
          </div>
        </section>
        <Help view={view} />
      </main>
      <AppFooter view={view} />
    </div>
  );
}
