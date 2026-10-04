import type { ConversionResult } from "./types.ts";

export function createArchiveInWorker(
  outputs: ConversionResult[],
  signal: AbortSignal,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL("./archive-worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = (error?: Error, bytes?: Uint8Array<ArrayBuffer>) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else if (bytes) resolve(new Blob([bytes], { type: "application/zip" }));
      else reject(new Error("The archive worker returned no data."));
    };
    const abort = () =>
      finish(new DOMException("Archive creation cancelled.", "AbortError"));
    const timer = setTimeout(
      () =>
        finish(new Error("Archive creation timed out. Try a smaller batch.")),
      30000,
    );
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) =>
      finish(data.error ? new Error(data.error) : undefined, data.bytes);
    worker.onerror = () => finish(new Error("Archive creation failed."));
    worker.onmessageerror = () =>
      finish(new Error("Could not read the archive."));
    try {
      const copies = outputs.map((output) => ({
        filename: output.filename,
        bytes: output.bytes.slice(),
      }));
      worker.postMessage(
        copies,
        copies.map((output) => output.bytes.buffer),
      );
    } catch (error) {
      finish(
        error instanceof Error
          ? error
          : new Error("Could not create the archive."),
      );
    }
  });
}
