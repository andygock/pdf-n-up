import { useCallback, useEffect, useRef, useState } from "react";
import { downloadPdf } from "./download.ts";
import {
  formatBytes,
  formatPageSize,
  removeLegacyPersistedState,
} from "./format.ts";
import {
  assertCompatibleOutputSize,
  getCopyBoxes,
  getOutputGeometry,
  getResolvedLayout,
  getSpacing,
  linkCopyDimensions,
} from "./geometry.ts";
import {
  DEFAULT_OPTIONS,
  readPreferences,
  savePreferences,
} from "./preferences.ts";
import { readPdfFile } from "./read-pdf-file.ts";
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
  source: SourceMetadata | null;
  output: PdfOutput | null;
  options: ConversionOptions;
  processing: boolean;
  failed: boolean;
  status: Status;
}

const ready: Status = {
  title: "Ready",
  message: "Select a PDF to begin.",
};

export function useConversion(
  createWorker = () => new ConversionWorkerClient(),
) {
  const [savedPreferences] = useState(readPreferences);
  const [rememberSettings, setRememberSettings] = useState(!!savedPreferences);
  const [preferenceError, setPreferenceError] = useState("");
  const [state, setState] = useState<ConversionState>({
    source: null,
    output: null,
    options: savedPreferences ?? DEFAULT_OPTIONS,
    processing: false,
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
  const [worker] = useState(createWorker);
  const operation = useRef(0);
  const readingController = useRef<AbortController | null>(null);
  const update = useCallback((patch: Partial<ConversionState>) => {
    current.current = { ...current.current, ...patch };
    setState(current.current);
  }, []);

  // Object URLs retain their backing Blob until explicitly revoked. Release
  // the previous output whenever it is replaced, cleared or unloaded.
  const resetOutput = () => {
    if (current.current.output) URL.revokeObjectURL(current.current.output.url);
    update({ output: null, failed: false });
  };

  // Operation IDs prevent late reads or worker replies from changing a newer
  // document. Cancellation also discards the worker's parsed source.
  const release = useCallback(() => {
    operation.current += 1;
    readingController.current?.abort();
    worker.dispose();
    if (current.current.output) URL.revokeObjectURL(current.current.output.url);
  }, [worker]);
  const clearDocument = useCallback(() => {
    release();
    update({
      source: null,
      output: null,
      processing: false,
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

  const showFailure = (error: unknown, title: string) => {
    if (error instanceof WorkerLostError) clearDocument();
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

  const generate = async (token: number) => {
    resetOutput();
    const { source, options } = current.current;
    if (!source) return;
    // Ordinary option errors keep the validated source available for recovery.
    assertCompatibleOutputSize(getOutputGeometry({ ...source, ...options }));
    update({
      status: {
        title: "Creating output",
        message:
          "Arranging the page copies locally. Cancel to stop processing.",
        loading: true,
      },
    });
    const result = await worker.request("generate", options);
    if (token !== operation.current) return;
    const blob = new Blob([result.bytes], { type: "application/pdf" });
    update({
      output: {
        blob,
        measurements: {
          ...getOutputGeometry({ ...source, ...options }),
          ...getSpacing(options),
          boxes: getCopyBoxes({ ...source, ...options }),
        },
        url: URL.createObjectURL(blob),
        filename: result.filename,
        size: blob.size,
      },
      status: {
        type: "success",
        symbol: "✓",
        title: "Output ready",
        message: `${result.filename} is ready to open or download (${formatBytes(blob.size)}).`,
        progress: 100,
      },
    });
    // The React preview has independent cancellation and deadlines, so it
    // never holds the conversion controls disabled while rendering.
  };

  const selectFiles = async (files: FileList | File[] | null) => {
    if (current.current.processing) return;
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    if (selected.length !== 1) {
      update({
        status: {
          type: "error",
          title: "Multiple files rejected",
          message: "Select exactly one PDF file.",
        },
      });
      return;
    }
    clearDocument();
    const token = ++operation.current;
    update({
      processing: true,
      status: {
        title: "Validating PDF",
        message: "Checking the file structure and page count.",
        loading: true,
      },
    });
    try {
      const file = selected[0];
      const controller = new AbortController();
      readingController.current = controller;
      const bytes = await readPdfFile(file, controller.signal).finally(() => {
        if (readingController.current === controller)
          readingController.current = null;
      });
      if (token !== operation.current) return;
      const source = await worker.request(
        "load",
        { bytes, metadata: { name: file.name, size: file.size } },
        [bytes.buffer],
      );
      if (token !== operation.current) return;
      update({
        source,
        options:
          current.current.options.scaleMode === "dimensions"
            ? {
                ...current.current.options,
                ...linkCopyDimensions(source, {
                  copyWidthMm: current.current.options.copyWidthMm ?? 90,
                }),
              }
            : current.current.options,
      });
      await generate(token);
    } catch (error) {
      if (token === operation.current)
        showFailure(
          error,
          current.current.source ? "Conversion failed" : "File rejected",
        );
    } finally {
      if (token === operation.current) update({ processing: false });
    }
  };

  const selectPage = async (pageNumber: number) => {
    if (current.current.processing || !current.current.source) return;
    const token = ++operation.current;
    resetOutput();
    update({ processing: true });
    try {
      const source = await worker.request("selectPage", pageNumber);
      if (token !== operation.current) return;
      update({
        source,
        options:
          current.current.options.scaleMode === "dimensions"
            ? {
                ...current.current.options,
                ...linkCopyDimensions(source, {
                  copyWidthMm: current.current.options.copyWidthMm ?? 90,
                }),
              }
            : current.current.options,
      });
      await generate(token);
    } catch (error) {
      if (token === operation.current)
        showFailure(error, "Page selection failed");
    } finally {
      if (token === operation.current) update({ processing: false });
    }
  };

  const changeOptions = async (patch: Partial<ConversionOptions>) => {
    if (current.current.processing) return;
    const options = { ...current.current.options, ...patch };
    const source = current.current.source;
    if (source && options.scaleMode === "dimensions") {
      Object.assign(
        options,
        linkCopyDimensions(
          source,
          patch.copyHeightMm !== undefined && patch.copyWidthMm === undefined
            ? { copyHeightMm: patch.copyHeightMm }
            : { copyWidthMm: options.copyWidthMm ?? 90 },
        ),
      );
    }
    update({ options });
    resetOutput();
    // Controlled inputs and conversion use the same options; browser-restored
    // radio values cannot diverge from the applied layout.
    if (!current.current.source) return;
    const token = ++operation.current;
    update({ processing: true });
    try {
      await generate(token);
    } catch (error) {
      if (token === operation.current) showFailure(error, "Conversion failed");
    } finally {
      if (token === operation.current) update({ processing: false });
    }
  };

  const openOutput = async (action: OutputAction) => {
    const output = current.current.output;
    if (!output) return;
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
    const { width, height } = state.source;
    const layout = getResolvedLayout(state.options.layout, width, height);
    details.layout = `${layout.copies}-up (${layout.columns}×${layout.rows})`;
    try {
      const { outputWidth, outputHeight, scale } = getOutputGeometry({
        ...state.source,
        ...state.options,
      });
      details = {
        ...details,
        outputSize: formatPageSize(outputWidth, outputHeight),
        scale: `${Number((scale * 100).toFixed(4))}%`,
      };
    } catch {
      // Keep source details visible when spacing cannot fit. Generation shows
      // the actionable error instead of leaving stale output dimensions.
    }
  }
  return {
    ...state,
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
    resetSettings: async () => {
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
    changeOptions,
    clearDocument,
    openOutput,
  };
}
