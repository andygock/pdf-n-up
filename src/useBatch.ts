import { useCallback, useEffect, useRef, useState } from "react";
import { createArchiveInWorker } from "./archive-client.ts";
import {
  type BatchEntry,
  MAX_BATCH_BYTES,
  MAX_BATCH_FILES,
  processBatch,
} from "./batch.ts";
import { downloadPdf, downloadZip } from "./download.ts";
import type { ConversionOptions } from "./types.ts";

export function useBatch() {
  const [entries, setEntries] = useState<BatchEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [archive, setArchive] = useState<Blob | null>(null);
  const controller = useRef<AbortController | null>(null);
  const operation = useRef(0);
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
    if (controller.current || !files.length) return;
    if (
      files.length > MAX_BATCH_FILES ||
      files.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES
    ) {
      setMessage("Choose at most 20 files totalling no more than 100 MB.");
      return;
    }
    setArchive(null);
    setMessage(
      "Choose a page for each PDF, then convert using the settings above.",
    );
    setEntries(
      files.map((file, id) => ({ id, file, pageNumber: 1, status: "queued" })),
    );
  };
  const setPage = (id: number, pageNumber: number) => {
    if (controller.current) return;
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
      await processBatch(queue, options, active.signal, (id, patch) => {
        if (token !== operation.current) return;
        const entry = { ...queue[id], ...patch };
        results.set(id, entry);
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
      if (id === undefined && archive)
        await downloadZip(archive, "pdf-nup-batch.zip");
      else {
        const output = entries.find((entry) => entry.id === id)?.output;
        if (output)
          await downloadPdf(
            new Blob([output.bytes], { type: "application/pdf" }),
            output.filename,
          );
      }
    } catch (error) {
      if (
        token === operation.current &&
        !(error instanceof Error && error.name === "AbortError")
      )
        setMessage(error instanceof Error ? error.message : "Download failed.");
    }
  };
  return {
    entries,
    processing,
    message,
    archive,
    selectFiles,
    setPage,
    run,
    cancel,
    clear,
    save,
  };
}
