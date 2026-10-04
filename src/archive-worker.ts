import { createArchive } from "./archive.ts";
import type { ConversionResult } from "./types.ts";

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<ConversionResult[]>) => void) | null;
  postMessage: (data: unknown, transfer?: Transferable[]) => void;
};
worker.onmessage = ({ data }) => {
  try {
    const bytes = createArchive(data);
    worker.postMessage({ bytes }, [bytes.buffer]);
  } catch (error) {
    worker.postMessage({
      error:
        error instanceof Error ? error.message : "Archive creation failed.",
    });
  }
};
