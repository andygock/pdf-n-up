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
import { SourcePicker } from "./SourcePicker.tsx";
import { SpacingInput } from "./SpacingInput.tsx";
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
    if (selected.length > 1) batch.selectFiles(selected);
    else await selectSingleFile(selected);
  };
  const { view, setView, headingRef } = useView();
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
            onClear={batch.processing ? batch.cancel : clearDocument}
            compact
          />
        )}
      </AppHeader>
      <main className={styles.main}>
        <PageHeading view={view} headingRef={headingRef} />
        <section
          hidden={view !== "convert"}
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
                onClear={batch.processing ? batch.cancel : clearDocument}
              />
            )}
            {source && source.pageCount > 1 && (
              <label htmlFor="sourcePage">
                Page to repeat (1–{source.pageCount}){" "}
                <SpacingInput
                  id="sourcePage"
                  min={1}
                  max={source.pageCount}
                  step={1}
                  value={source.pageNumber}
                  disabled={processing}
                  onCommit={(page) => void conversion.selectPage(page)}
                />
              </label>
            )}
            <ConversionOptions
              options={options}
              processing={processing}
              changeOptions={changeOptions}
            />
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={conversion.rememberSettings}
                  disabled={processing}
                  onChange={(event) =>
                    conversion.setRememberSettings(event.target.checked)
                  }
                />
                Remember settings on this device
              </label>{" "}
              <button
                type="button"
                disabled={processing}
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
            <ConversionFeedback
              source={source}
              output={output}
              options={options}
              processing={processing}
              status={status}
              failed={failed}
              details={details}
              changeOptions={changeOptions}
            />
            {(source || converting) && (
              <OutputPanel
                output={output}
                active={view === "convert"}
                openOutput={openOutput}
              />
            )}
            <BatchPanel batch={batch} options={options} disabled={processing} />
          </div>
        </section>
        <Help view={view} />
      </main>
      <AppFooter view={view} />
    </div>
  );
}
