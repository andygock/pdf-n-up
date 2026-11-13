import { useCallback, useEffect, useRef, useState } from "react";
import { createArchiveInWorker } from "./archive-client.ts";
import {
  type BatchEntry,
  MAX_BATCH_BYTES,
  MAX_BATCH_FILES,
  processBatch,
} from "./batch.ts";
import { downloadPdf, downloadZip } from "./download.ts";
import { validateSourceFile } from "./read-source-file.ts";
import type { ConversionOptions } from "./types.ts";

const optionsKey = (options: ConversionOptions) =>
  JSON.stringify(
    options,
    Object.keys({ ...options, ...options.layout }).sort(),
  );

export function useBatch() {
  const [entries, setEntries] = useState<BatchEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [archive, setArchive] = useState<Blob | null>(null);
  const [runSettings, setRunSettings] = useState<string | null>(null);
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
    setRunSettings(null);
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
    setRunSettings(null);
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
    if (entries.length === 1) setRunSettings(null);
    setMessage(`Removed ${entry.file.name}.`);
  };
  const replaceFile = (id: number, file: File) => {
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
    operation.current++;
    setEntries((items) =>
      items.map((item) =>
        item.id === id ? { id, file, pageNumber: 1, status: "queued" } : item,
      ),
    );
    setArchive(null);
    setMessage(
      `Replaced with ${file.name}. Convert the batch to update results.`,
    );
    return true;
  };
  const setPage = (id: number, pageNumber: number) => {
    if (
      controller.current ||
      !entries.some((item) => item.id === id && item.pageNumber !== pageNumber)
    )
      return;
    operation.current++;
    setArchive(null);
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
              error: undefined,
              warnings: undefined,
            }
          : item,
      ),
    );
  };
  const run = async (options: ConversionOptions) => {
    if (controller.current || !entries.length) return;
    const active = new AbortController();
    controller.current = active;
    const token = ++operation.current;
    const snapshot = { ...options, layout: { ...options.layout } };
    setRunSettings(optionsKey(snapshot));
    const queue = entries.map((entry) => ({
      ...entry,
      status: "queued" as const,
      output: undefined,
      error: undefined,
      warnings: undefined,
    }));
    const results = new Map<number, BatchEntry>();
    setEntries(queue);
    setArchive(null);
    setProcessing(true);
    setMessage("Converting files locally, one at a time…");
    try {
      await processBatch(queue, snapshot, active.signal, (id, patch) => {
        if (token !== operation.current) return;
        const entry = queue.find((item) => item.id === id);
        if (!entry) return;
        results.set(id, { ...entry, ...patch });
        const completed = [...results.values()].filter(
          (item) => item.status === "ready" || item.status === "failed",
        ).length;
        setMessage(
          `Converting files locally: ${completed} of ${queue.length} complete…`,
        );
        setEntries((items) =>
          items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        );
      });
      active.signal.throwIfAborted();
      const outputs = [...results.values()].flatMap((entry) =>
        entry.output ? [entry.output] : [],
      );
      if (outputs.length) {
        setMessage("Preparing ZIP download…");
        const zip = await createArchiveInWorker(outputs, active.signal);
        if (token !== operation.current) return;
        setArchive(zip);
      }
      if (token === operation.current)
        setMessage(
          `${outputs.length} of ${queue.length} PDFs ready. Results use the settings from this run; convert again to apply changes.`,
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
    isStale: (options: ConversionOptions) =>
      runSettings !== null &&
      entries.some((entry) => entry.output) &&
      runSettings !== optionsKey(options),
    selectFiles,
    remove,
    replaceFile,
    setPage,
    run,
    cancel,
    clear,
    save,
  };
}
