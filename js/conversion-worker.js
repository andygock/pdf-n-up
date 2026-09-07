import "../vendor/pdf-lib/pdf-lib.min.js";
import { createConversionEngine } from "./conversion.js";

const engine = createConversionEngine(globalThis.PDFLib);

// Only metadata and transferable output bytes leave this worker. The parsed
// source stays here until replacement or termination, including cancellation.
self.onmessage = async ({ data: { id, method, payload } }) => {
  try {
    let result;
    if (method === "load")
      result = await engine.load(payload.bytes, payload.metadata);
    else if (method === "generate") result = await engine.generate(payload);
    else throw new Error("Unknown conversion request.");
    self.postMessage({ id, result }, result.bytes ? [result.bytes.buffer] : []);
  } catch (error) {
    self.postMessage({
      id,
      error:
        error instanceof RangeError
          ? "The browser ran out of available memory. Try a smaller or simpler PDF."
          : error.message,
    });
  }
};
