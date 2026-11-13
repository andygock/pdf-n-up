import { useCallback, useEffect, useRef, useState } from "react";
import { createArchiveInWorker } from "./archive-client.ts";
import {
  type BatchEntry,
  MAX_BATCH_BYTES,
  MAX_BATCH_FILES,
  processBatch,
} from "./batch.ts";
import { downloadPdf, downloadZip } from "./download.ts";
import { DEFAULT_OPTIONS } from "./preferences.ts";
import { readSourceFile, validateSourceFile } from "./read-source-file.ts";
import type { ConversionOptions } from "./types.ts";
import { ConversionWorkerClient } from "./worker-client.ts";

const normaliseOptions = (options: ConversionOptions): ConversionOptions => ({
  ...DEFAULT_OPTIONS,
  ...Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  ),
  layout: { ...options.layout, custom: options.layout.custom ?? false },
});
const optionsKey = (options: ConversionOptions) => {
  const normalised = normaliseOptions(options);
  return JSON.stringify(
    normalised,
    Object.keys({ ...normalised, ...normalised.layout }).sort(),
  );
};

export function useBatch() {
  const [entries, setEntries] = useState<BatchEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [archive, setArchive] = useState<Blob | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const operation = useRef(0);
  const nextId = useRef(0);
  const cancel = useCallback(() => {
    operation.current++;
    controller.current?.abort();
    controller.current = null;
    setProcessing(false);
    setEntries((items) =>
      items.map((item) =>
        item.status === "processing" || item.status === "queued"
          ? { ...item, status: "cancelled" }
          : item,
      ),
    );
    setMessage(
      "Batch cancelled. Completed PDFs remain available individually.",
    );
  }, []);
  const clear = useCallback(() => {
    cancel();
    setEntries([]);
    setArchive(null);
    setArchiveError("");
    setMessage("");
  }, [cancel]);
  useEffect(() => {
    const pagehide = (event: PageTransitionEvent) => {
      if (!event.persisted) clear();
    };
    window.addEventListener("pagehide", pagehide);
    return () => {
      operation.current++;
      controller.current?.abort();
      window.removeEventListener("pagehide", pagehide);
    };
  }, [clear]);

  const selectFiles = (files: File[]) => {
    if (controller.current || !files.length) return false;
    if (
      files.length > MAX_BATCH_FILES ||
      files.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES
    ) {
      setMessage("Choose at most 20 files totalling no more than 100 MB.");
      return false;
    }
    operation.current++;
    setArchive(null);
    setArchiveError("");
    setMessage(
      "Choose a page for each PDF; images use one page. Convert using the settings above.",
    );
    setEntries(
      files.map((file) => {
        const id = nextId.current++;
        try {
          validateSourceFile(file);
          return { id, file, pageNumber: 1, status: "queued" };
        } catch (error) {
          return {
            id,
            file,
            pageNumber: 1,
            status: "failed",
            error: error instanceof Error ? error.message : "Invalid file.",
          };
        }
      }),
    );
    return true;
  };
  const remove = (id: number) => {
    if (controller.current) return;
    const entry = entries.find((item) => item.id === id);
    if (!entry) return;
    operation.current++;
    setEntries((items) => items.filter((item) => item.id !== id));
    setArchive(null);
    setArchiveError("");
    setMessage(`Removed ${entry.file.name}.`);
  };
  const replaceFile = async (id: number, file: File) => {
    if (controller.current || !entries.some((item) => item.id === id))
      return false;
    try {
      validateSourceFile(file);
      if (
        entries.reduce(
          (sum, item) => sum + (item.id === id ? file.size : item.file.size),
          0,
        ) > MAX_BATCH_BYTES
      )
        throw new Error("Choose files totalling no more than 100 MB.");
    } catch (error) {
      const replacementError = `Could not replace the file: ${error instanceof Error ? error.message : "Invalid file."}`;
      setEntries((items) =>
        items.map((item) =>
          item.id === id ? { ...item, replacementError } : item,
        ),
      );
      return false;
    }
    const active = new AbortController();
    controller.current = active;
    const token = ++operation.current;
    const worker = new ConversionWorkerClient();
    const abort = () => worker.dispose();
    active.signal.addEventListener("abort", abort, { once: true });
    setProcessing(true);
    setMessage(`Validating replacement ${file.name}…`);
    try {
      const bytes = await readSourceFile(file, active.signal);
      active.signal.throwIfAborted();
      await worker.request(
        "load",
        { bytes, metadata: { name: file.name, size: file.size } },
        [bytes.buffer],
      );
      if (token !== operation.current) return false;
      setEntries((items) =>
        items.map((item) =>
          item.id === id ? { id, file, pageNumber: 1, status: "queued" } : item,
        ),
      );
      setArchive(null);
      setArchiveError("");
      setMessage(
        `Replaced with ${file.name}. Convert the batch to update results.`,
      );
      return true;
    } catch (error) {
      if (token === operation.current) {
        const replacementError = `Could not replace the file: ${error instanceof Error ? error.message : "Invalid file."}`;
        setEntries((items) =>
          items.map((item) =>
            item.id === id ? { ...item, replacementError } : item,
          ),
        );
        setMessage(
          "Replacement rejected. Previous files and results remain available.",
        );
      }
      return false;
    } finally {
      active.signal.removeEventListener("abort", abort);
      worker.dispose();
      if (token === operation.current) {
        controller.current = null;
        setProcessing(false);
      }
    }
  };
  const setPage = (id: number, pageNumber: number) => {
    if (
      controller.current ||
      !entries.some((item) => item.id === id && item.pageNumber !== pageNumber)
    )
      return;
    operation.current++;
    setArchive(null);
    setArchiveError("");
    setMessage(
      "Page selection changed. Convert the batch again to update results.",
    );
    setEntries((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              pageNumber,
              status: "queued",
              output: undefined,
              outputSettings: undefined,
              error: undefined,
              warnings: undefined,
            }
          : item,
      ),
    );
  };
  const prepareArchive = async (
    items: BatchEntry[],
    key: string,
    active: AbortController,
    token: number,
  ) => {
    const ready = items.filter((entry) => entry.output);
    if (!ready.length) return 0;
    if (ready.some((entry) => entry.outputSettings !== key))
      throw new Error(
        "Results use different settings. Convert the batch again before preparing a ZIP.",
      );
    setMessage("Preparing ZIP download…");
    try {
      const zip = await createArchiveInWorker(
        ready.flatMap((entry) => (entry.output ? [entry.output] : [])),
        active.signal,
      );
      if (token === operation.current) setArchive(zip);
    } catch (error) {
      if (token === operation.current) {
        const detail =
          error instanceof Error ? error.message : "Archive creation failed.";
        setArchiveError(detail);
      }
      throw error;
    }
    return ready.length;
  };
  const rebuildArchive = async (options: ConversionOptions) => {
    if (controller.current) return;
    const active = new AbortController();
    controller.current = active;
    const token = ++operation.current;
    setProcessing(true);
    setArchiveError("");
    try {
      const count = await prepareArchive(
        entries,
        optionsKey(options),
        active,
        token,
      );
      if (token === operation.current)
        setMessage(
          `${count} ${count === 1 ? "PDF" : "PDFs"} ready in the ZIP.`,
        );
    } catch (error) {
      if (token === operation.current)
        setMessage(
          `${error instanceof Error ? error.message : "Archive creation failed."} Completed PDFs remain available individually.`,
        );
    } finally {
      if (token === operation.current) {
        controller.current = null;
        setProcessing(false);
      }
    }
  };
  const run = async (options: ConversionOptions, onlyId?: number) => {
    if (controller.current || !entries.length) return;
    if (
      archive &&
      entries.every(
        (entry) => entry.output && entry.outputSettings === optionsKey(options),
      )
    ) {
      setMessage(
        "All PDFs already match the current settings. The ZIP is ready to save.",
      );
      return;
    }
    const active = new AbortController();
    controller.current = active;
    const token = ++operation.current;
    const snapshot = { ...options, layout: { ...options.layout } };
    const key = optionsKey(snapshot);
    const queue = entries
      .filter(
        (entry) =>
          (onlyId === undefined || entry.id === onlyId) &&
          !(entry.output && entry.outputSettings === key),
      )
      .map((entry) => ({
        ...entry,
        status: "queued" as const,
        output: undefined,
        outputSettings: undefined,
        error: undefined,
        warnings: undefined,
      }));
    const queuedIds = new Set(queue.map((entry) => entry.id));
    const retained = entries.filter((entry) => !queuedIds.has(entry.id));
    const results = new Map<number, BatchEntry>(
      retained.map((entry) => [entry.id, entry]),
    );
    setEntries(
      entries.map(
        (entry) => queue.find((item) => item.id === entry.id) ?? entry,
      ),
    );
    setArchive(null);
    setArchiveError("");
    setProcessing(true);
    setMessage("Converting files locally, one at a time…");
    try {
      await processBatch(
        queue,
        snapshot,
        active.signal,
        (id, patch) => {
          if (token !== operation.current) return;
          const entry = queue.find((item) => item.id === id);
          if (!entry) return;
          const update = {
            ...patch,
            ...(patch.output ? { outputSettings: key } : {}),
          };
          results.set(id, { ...entry, ...update });
          const completed = [...results.values()].filter(
            (item) => item.status === "ready" || item.status === "failed",
          ).length;
          setMessage(
            `Converting files locally: ${completed} of ${entries.length} complete…`,
          );
          setEntries((items) =>
            items.map((item) =>
              item.id === id ? { ...item, ...update } : item,
            ),
          );
        },
        undefined,
        retained.reduce(
          (sum, entry) => sum + (entry.output?.bytes.byteLength ?? 0),
          0,
        ),
      );
      active.signal.throwIfAborted();
      const finalEntries = entries.map(
        (entry) => results.get(entry.id) ?? entry,
      );
      const outputCount = await prepareArchive(
        finalEntries,
        key,
        active,
        token,
      );
      if (token === operation.current)
        setMessage(
          `${outputCount} of ${entries.length} PDFs ready. Results use the settings from this run; convert again to apply changes.`,
        );
    } catch (error) {
      if (token === operation.current)
        setMessage(
          error instanceof Error ? error.message : "Batch conversion failed.",
        );
    } finally {
      if (token === operation.current) {
        controller.current = null;
        setProcessing(false);
      }
    }
  };
  const save = async (id?: number) => {
    const token = operation.current;
    try {
      let result: Awaited<ReturnType<typeof downloadPdf>> | undefined;
      if (id === undefined && archive)
        result = await downloadZip(archive, "pdf-nup-batch.zip");
      else {
        const output = entries.find((entry) => entry.id === id)?.output;
        if (output)
          result = await downloadPdf(
            new Blob([output.bytes], { type: "application/pdf" }),
            output.filename,
          );
      }
      if (token === operation.current && result)
        setMessage(
          result.saved
            ? `Saved ${result.filename}.`
            : `Download started: ${result.filename}. Check your browser downloads.`,
        );
    } catch (error) {
      if (token === operation.current)
        setMessage(
          error instanceof Error && error.name === "AbortError"
            ? "Save cancelled. Results remain available."
            : error instanceof Error
              ? error.message
              : "Download failed.",
        );
    }
  };
  return {
    entries,
    processing,
    message,
    archive,
    archiveError,
    isStale: (options: ConversionOptions) =>
      entries.some(
        (entry) => entry.output && entry.outputSettings !== optionsKey(options),
      ),
    canRebuildArchive: (options: ConversionOptions) =>
      !archive &&
      entries.some((entry) => entry.output) &&
      entries.every(
        (entry) =>
          !entry.output || entry.outputSettings === optionsKey(options),
      ),
    selectFiles,
    remove,
    replaceFile,
    setPage,
    run,
    rebuildArchive,
    cancel,
    clear,
    save,
  };
}
