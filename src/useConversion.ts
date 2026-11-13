import { useCallback, useEffect, useRef, useState } from "react";
import { downloadPdf } from "./download.ts";
import {
  formatBytes,
  formatPageSize,
  removeLegacyPersistedState,
} from "./format.ts";
import {
  assertCompatibleOutputSize,
  getFitRecovery,
  getOutputGeometry,
  getResolvedLayout,
  resolveCopyDimensions,
  resolveSourceGeometry,
} from "./geometry.ts";
import {
  DEFAULT_OPTIONS,
  readPreferences,
  savePreferences,
} from "./preferences.ts";
import { readSourceFile } from "./read-source-file.ts";
import type {
  ConversionOptions,
  OutputAction,
  PdfOutput,
  SourceMetadata,
} from "./types.ts";
import { ConversionWorkerClient, WorkerLostError } from "./worker-client.ts";

interface Status {
  title: string;
  message: string;
  type?: "neutral" | "error" | "success";
  symbol?: string;
  loading?: boolean;
  progress?: number;
}

interface ConversionState {
  sourceFile: File | null;
  source: SourceMetadata | null;
  output: PdfOutput | null;
  options: ConversionOptions;
  processing: boolean;
  loading: boolean;
  outputCurrent: boolean;
  failed: boolean;
  status: Status;
}

const ready: Status = {
  title: "Ready",
  message: "Select a PDF or image to begin.",
};

export function useConversion(
  createWorker = () => new ConversionWorkerClient(),
) {
  const [savedPreferences] = useState(readPreferences);
  const [rememberSettings, setRememberSettings] = useState(!!savedPreferences);
  const [preferenceError, setPreferenceError] = useState("");
  const [settingsReset, setSettingsReset] = useState(0);
  const [state, setState] = useState<ConversionState>({
    source: null,
    sourceFile: null,
    output: null,
    options: savedPreferences ?? DEFAULT_OPTIONS,
    processing: false,
    loading: false,
    outputCurrent: false,
    failed: false,
    status: ready,
  });
  useEffect(() => {
    if (!rememberSettings) return;
    try {
      savePreferences(state.options);
      setPreferenceError("");
    } catch (error) {
      setPreferenceError(
        error instanceof Error
          ? error.message
          : "Browser storage is unavailable.",
      );
    }
  }, [rememberSettings, state.options]);
  const current = useRef(state);
  const [initialWorker] = useState(createWorker);
  const worker = useRef<ConversionWorkerClient | null>(initialWorker);
  const stagedWorker = useRef<ConversionWorkerClient | null>(null);
  const revision = useRef(0);
  const desiredPage = useRef(1);
  const running = useRef<Promise<boolean> | null>(null);
  const operation = useRef(0);
  const readingController = useRef<AbortController | null>(null);
  const update = useCallback((patch: Partial<ConversionState>) => {
    current.current = { ...current.current, ...patch };
    setState(current.current);
  }, []);

  // Object URLs retain their backing Blob until explicitly revoked. Release
  // the previous output whenever it is replaced, cleared or unloaded.
  // Operation IDs isolate cancelled work; revisions coalesce edits within a job.
  const release = useCallback(() => {
    operation.current++;
    revision.current++;
    running.current = null;
    readingController.current?.abort();
    stagedWorker.current?.dispose();
    stagedWorker.current = null;
    worker.current?.dispose();
    worker.current = null;
    if (current.current.output) URL.revokeObjectURL(current.current.output.url);
  }, []);
  const clearDocument = useCallback(() => {
    release();
    update({
      source: null,
      sourceFile: null,
      output: null,
      processing: false,
      loading: false,
      outputCurrent: false,
      failed: false,
      status: ready,
    });
  }, [release, update]);

  useEffect(() => {
    removeLegacyPersistedState();
    const pagehide = (event: PageTransitionEvent) => {
      // Preserve live state in the back/forward cache. A cancelled navigation
      // must never revoke URLs still used by the current page.
      if (!event.persisted) clearDocument();
    };
    window.addEventListener("pagehide", pagehide);
    return () => {
      window.removeEventListener("pagehide", pagehide);
      release();
    };
  }, [clearDocument, release]);

  const showFailure = (
    error: unknown,
    title: string,
    invalidateWorker = true,
  ) => {
    if (invalidateWorker && error instanceof WorkerLostError) {
      worker.current?.dispose();
      worker.current = null;
    }
    update({
      failed: true,
      status: {
        type: "error",
        symbol: "!",
        title,
        message:
          error instanceof Error
            ? error.message
            : "The PDF could not be processed.",
      },
    });
  };

  const generateLatest = (): Promise<boolean> => {
    if (running.current) return running.current;
    if (!current.current.sourceFile || !current.current.source)
      return Promise.resolve(true);
    const token = operation.current;
    update({ processing: true, failed: false });
    const task = Promise.resolve()
      .then(async () => {
        while (token === operation.current) {
          const version = revision.current;
          try {
            let source = current.current.source;
            const file = current.current.sourceFile;
            if (!source || !file) return false;
            if (!worker.current) {
              const controller = new AbortController();
              readingController.current = controller;
              const bytes = await readSourceFile(file, controller.signal);
              if (token !== operation.current) return false;
              readingController.current = null;
              worker.current = createWorker();
              source = await worker.current.request(
                "load",
                {
                  bytes,
                  metadata: { name: file.name, size: file.size },
                },
                [bytes.buffer],
              );
            }
            if (token !== operation.current) return false;
            const active = worker.current;
            if (!active) return false;
            if (source.pageNumber !== desiredPage.current)
              source = await active.request("selectPage", desiredPage.current);
            if (token !== operation.current) return false;
            const options = resolveCopyDimensions(
              current.current.options,
              resolveSourceGeometry(source, current.current.options.sourceBox),
            );
            update({
              source,
              options,
              status: {
                title: "Updating output",
                message:
                  "Your previous preview remains visible while the latest settings are processed.",
                loading: true,
              },
            });
            // Ordinary option errors keep the validated source available for recovery.
            if (options.mode !== "sequence")
              assertCompatibleOutputSize(
                getOutputGeometry({
                  ...resolveSourceGeometry(source, options.sourceBox),
                  ...options,
                }),
              );
            const result = await active.request("generate", options);
            if (token !== operation.current) return false;
            if (version !== revision.current) continue;
            const blob = new Blob([result.bytes], { type: "application/pdf" });
            const previous = current.current.output;
            update({
              source: { ...source, warnings: result.warnings },
              output: {
                blob,
                sheets: result.sheets,
                measurements: result.sheets[0],
                url: URL.createObjectURL(blob),
                filename: result.filename,
                size: blob.size,
              },
              outputCurrent: true,
              failed: false,
              status: {
                type: "success",
                symbol: "✓",
                title: "Output ready",
                message: `${result.filename} is ready to open or download (${formatBytes(blob.size)}).`,
                progress: 100,
              },
            });
            if (previous) URL.revokeObjectURL(previous.url);
            // The React preview has independent cancellation and deadlines, so it
            // never holds the conversion controls disabled while rendering.
            return true;
          } catch (error) {
            if (token !== operation.current) return false;
            if (error instanceof WorkerLostError) {
              worker.current?.dispose();
              worker.current = null;
            }
            if (version !== revision.current) continue;
            showFailure(error, "Conversion failed");
            return false;
          }
        }
        return false;
      })
      .finally(() => {
        if (token === operation.current) {
          running.current = null;
          update({ processing: false });
        }
      });
    running.current = task;
    return task;
  };

  const selectFiles = async (
    files: FileList | File[] | null,
    resetJob = !!current.current.sourceFile,
  ): Promise<boolean> => {
    if (current.current.processing) return false;
    const selected = Array.from(files ?? []);
    if (!selected.length) return false;
    if (selected.length !== 1) {
      update({
        status: {
          type: "error",
          title: "Multiple files rejected",
          message: "Select exactly one PDF or image file.",
        },
      });
      return false;
    }
    const token = ++operation.current;
    update({
      processing: true,
      loading: true,
      failed: false,
      status: {
        title: "Validating file",
        message:
          "Your current document is kept until the replacement is valid.",
        loading: true,
      },
    });
    let committed = false;
    try {
      const file = selected[0];
      const controller = new AbortController();
      readingController.current = controller;
      const bytes = await readSourceFile(file, controller.signal);
      if (token !== operation.current) return false;
      readingController.current = null;
      const candidate = createWorker();
      stagedWorker.current = candidate;
      const source = await candidate.request(
        "load",
        {
          bytes,
          metadata: { name: file.name, size: file.size },
        },
        [bytes.buffer],
      );
      if (token !== operation.current) return false;
      worker.current?.dispose();
      worker.current = candidate;
      stagedWorker.current = null;
      desiredPage.current = 1;
      revision.current++;
      // Ranges and quantities belong to the replaced document, not layout preferences.
      const options = resolveCopyDimensions(
        {
          ...current.current.options,
          ...(resetJob
            ? {
                pageRange: "",
                quantity: undefined,
                fillLastSheet: false,
              }
            : {}),
        },
        resolveSourceGeometry(source, current.current.options.sourceBox),
      );
      const previous = current.current.output;
      update({
        source,
        sourceFile: file,
        options,
        output: null,
        outputCurrent: false,
        loading: false,
      });
      if (previous) URL.revokeObjectURL(previous.url);
      committed = true;
      await generateLatest();
      return true;
    } catch (error) {
      if (token === operation.current)
        showFailure(
          error,
          committed ? "Conversion failed" : "File rejected",
          committed,
        );
      return committed;
    } finally {
      if (token === operation.current) {
        stagedWorker.current?.dispose();
        stagedWorker.current = null;
        readingController.current = null;
        update({ processing: false, loading: false });
      }
    }
  };

  const selectPage = async (pageNumber: number) => {
    if (current.current.loading || !current.current.source) return false;
    if (
      current.current.source.pageNumber === pageNumber &&
      desiredPage.current === pageNumber
    )
      return true;
    desiredPage.current = pageNumber;
    revision.current++;
    update({ outputCurrent: false });
    return generateLatest();
  };

  const changeOptions = async (patch: Partial<ConversionOptions>) => {
    if (current.current.loading) return false;
    let options = { ...current.current.options, ...patch };
    if (patch.copyHeightMm !== undefined && patch.copyWidthMm === undefined)
      options.dimensionAxis = "height";
    else if (patch.copyWidthMm !== undefined) options.dimensionAxis = "width";
    const source = current.current.source;
    if (source)
      options = resolveCopyDimensions(
        options,
        resolveSourceGeometry(source, options.sourceBox),
      );
    if (JSON.stringify(options) === JSON.stringify(current.current.options))
      return source && desiredPage.current !== source.pageNumber
        ? generateLatest()
        : true;
    revision.current++;
    // Controlled inputs and conversion use the same options; browser-restored
    // radio values cannot diverge from the applied layout.
    update({ options, outputCurrent: false, failed: false });
    return generateLatest();
  };

  const cancel = () => {
    operation.current++;
    revision.current++;
    running.current = null;
    readingController.current?.abort();
    readingController.current = null;
    stagedWorker.current?.dispose();
    stagedWorker.current = null;
    worker.current?.dispose();
    worker.current = null;
    update({
      processing: false,
      loading: false,
      failed: false,
      status: {
        title: "Processing cancelled",
        message: current.current.sourceFile
          ? "Your source is retained. Retry when ready, or continue editing settings."
          : "Choose a PDF or image to begin.",
      },
    });
  };

  const openOutput = async (action: OutputAction) => {
    const output = current.current.output;
    if (!output || !current.current.outputCurrent) return;
    if (action === "save") {
      try {
        const result = await downloadPdf(output.blob, output.filename);
        if (!result || current.current.output !== output) return;
        update({
          status: {
            type: "success",
            symbol: "↓",
            title: result.saved ? "PDF saved" : "Download started",
            message: result.saved
              ? `${result.filename} has been saved.`
              : `${result.filename} has been passed to the browser download manager.`,
          },
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        if (current.current.output !== output) return;
        update({
          status: {
            type: "error",
            symbol: "!",
            title: "Download failed",
            message:
              error instanceof Error
                ? error.message
                : "The PDF could not be saved. Please try again.",
          },
        });
      }
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = output.url;
    anchor.rel = "noopener noreferrer";
    anchor.target = "_blank";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  };

  let details = { outputSize: "Spacing does not fit", scale: "—", layout: "" };
  if (state.source) {
    const selectedSource = resolveSourceGeometry(
      state.source,
      state.options.sourceBox,
    );
    const { width, height } = selectedSource;
    const layout = getResolvedLayout(state.options.layout, width, height);
    details.layout = `${layout.copies}-up (${layout.columns}×${layout.rows})`;
    try {
      const { outputWidth, outputHeight, scale, layout } = getOutputGeometry({
        ...selectedSource,
        ...state.options,
      });
      details = {
        ...details,
        layout: `${layout.copies}-up (${layout.columns}\u00d7${layout.rows})`,
        outputSize:
          (state.options.outputRotation ?? 0) % 180
            ? formatPageSize(outputHeight, outputWidth)
            : formatPageSize(outputWidth, outputHeight),
        scale: `${Number((scale * 100).toFixed(4))}%`,
      };
    } catch {
      // Keep source details visible when spacing cannot fit. Generation shows
      // the actionable error instead of leaving stale output dimensions.
    }
  }
  const sheets = state.output?.sheets;
  if (sheets?.length && state.options.mode === "sequence") {
    const scales = sheets.flatMap((sheet) => sheet.scales);
    const min = Math.min(...scales) * 100,
      max = Math.max(...scales) * 100;
    details = {
      outputSize: formatPageSize(sheets[0].outputWidth, sheets[0].outputHeight),
      layout: `${sheets[0].capacity}-up / ${sheets.length} sheets`,
      scale:
        Math.abs(max - min) < 0.0001
          ? `${Number(min.toFixed(2))}%`
          : `${Number(min.toFixed(2))}-${Number(max.toFixed(2))}%`,
    };
  }
  let recovery: ReturnType<typeof getFitRecovery> = null;
  if (
    state.failed &&
    state.status.title !== "File rejected" &&
    state.source &&
    state.options.mode !== "sequence"
  ) {
    try {
      recovery = getFitRecovery({
        ...resolveSourceGeometry(state.source, state.options.sourceBox),
        ...state.options,
      });
    } catch {
      /* Keep the original validation error. */
    }
  }
  return {
    ...state,
    recovery,
    details,
    rememberSettings,
    setRememberSettings: (enabled: boolean) => {
      if (!enabled) {
        try {
          savePreferences(null);
          setPreferenceError("");
        } catch (error) {
          setPreferenceError(
            error instanceof Error
              ? error.message
              : "Browser storage is unavailable.",
          );
        }
      }
      setRememberSettings(enabled);
    },
    preferenceError,
    settingsReset,
    resetSettings: async () => {
      setSettingsReset((version) => version + 1);
      setRememberSettings(false);
      try {
        savePreferences(null);
        setPreferenceError("");
      } catch (error) {
        setPreferenceError(
          error instanceof Error
            ? error.message
            : "Browser storage is unavailable.",
        );
      }
      await changeOptions(DEFAULT_OPTIONS);
    },
    selectFiles,
    selectPage,
    applyPages: async (
      patch: Partial<ConversionOptions>,
      pageNumber?: number,
    ) => {
      if (current.current.loading) return false;
      if (
        pageNumber !== undefined &&
        current.current.source &&
        desiredPage.current !== pageNumber
      ) {
        desiredPage.current = pageNumber;
        revision.current++;
        update({ outputCurrent: false });
      }
      return changeOptions(patch);
    },
    changeOptions,
    clearDocument,
    cancel,
    retry: generateLatest,
    openOutput,
  };
}
