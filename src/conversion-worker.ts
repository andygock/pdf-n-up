import * as PDFLib from "pdf-lib";
import { createConversionEngine } from "./conversion.ts";
import type { WorkerRequest, WorkerResponse } from "./types.ts";

const engine = createConversionEngine(PDFLib);
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => Promise<void>) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};

// Only metadata and transferable output bytes leave this worker. The parsed
// source stays here until replacement or termination, including cancellation.
worker.onmessage = async ({ data }) => {
  const { id } = data;
  try {
    if (data.method === "load") {
      const result = await engine.load(
        data.payload.bytes,
        data.payload.metadata,
      );
      worker.postMessage({ id, result });
    } else if (data.method === "selectPage") {
      worker.postMessage({ id, result: engine.selectPage(data.payload) });
    } else if (data.method === "generate") {
      const result = await engine.generate(data.payload);
      worker.postMessage({ id, result }, [result.bytes.buffer]);
    } else throw new Error("Unknown conversion request.");
  } catch (error) {
    worker.postMessage({
      id,
      error:
        error instanceof RangeError
          ? "The browser ran out of available memory. Try a smaller or simpler PDF."
          : error instanceof Error
            ? error.message
            : String(error),
    });
  }
};
