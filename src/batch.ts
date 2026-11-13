import { readSourceFile } from "./read-source-file.ts";
import type { ConversionOptions, ConversionResult } from "./types.ts";
import { ConversionWorkerClient } from "./worker-client.ts";

export const MAX_BATCH_FILES = 20;
export const MAX_BATCH_BYTES = 100_000_000;
export interface BatchEntry {
  id: number;
  file: File;
  pageNumber: number;
  status: "queued" | "processing" | "ready" | "failed" | "cancelled";
  output?: ConversionResult;
  // Source and page edits clear the output; this key permits reuse across runs.
  outputSettings?: string;
  warnings?: string[];
  error?: string;
  replacementError?: string;
}

export async function processBatch(
  entries: BatchEntry[],
  options: ConversionOptions,
  signal: AbortSignal,
  report: (id: number, patch: Partial<BatchEntry>) => void,
  createWorker = () => new ConversionWorkerClient(),
  retainedBytes = 0,
) {
  let total = retainedBytes;
  for (const entry of entries) {
    if (signal.aborted) break;
    const worker = createWorker();
    const abort = () => worker.dispose();
    signal.addEventListener("abort", abort, { once: true });
    report(entry.id, { status: "processing" });
    try {
      const bytes = await readSourceFile(entry.file, signal);
      signal.throwIfAborted();
      let metadata = await worker.request(
        "load",
        { bytes, metadata: { name: entry.file.name, size: entry.file.size } },
        [bytes.buffer],
      );
      signal.throwIfAborted();
      if (options.mode !== "sequence" && entry.pageNumber !== 1)
        metadata = await worker.request("selectPage", entry.pageNumber);
      signal.throwIfAborted();
      const output = await worker.request("generate", options);
      signal.throwIfAborted();
      if (total + output.bytes.byteLength > MAX_BATCH_BYTES)
        throw new Error("Batch results exceed 100 MB. Use a smaller batch.");
      total += output.bytes.byteLength;
      report(entry.id, {
        status: "ready",
        output,
        warnings: output.warnings ?? metadata.warnings,
      });
    } catch (error) {
      if (signal.aborted) break;
      report(entry.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Conversion failed.",
      });
    } finally {
      signal.removeEventListener("abort", abort);
      worker.dispose();
    }
  }
}
