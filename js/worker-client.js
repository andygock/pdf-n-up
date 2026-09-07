// One request at a time keeps the worker's retained source unambiguous. A
// deadline terminates the worker itself, rather than merely rejecting a Promise
// while untrusted parsing or decompression continues consuming resources.
export class ConversionWorkerClient {
  constructor(
    factory = () =>
      new Worker(new URL("./conversion-worker.js", import.meta.url), {
        type: "module",
      }),
    timeoutMs = 30_000,
  ) {
    this.factory = factory;
    this.timeoutMs = timeoutMs;
    this.worker = null;
    this.pending = null;
    this.nextId = 0;
  }

  dispose(message = "Processing cancelled. Select a PDF to start again.") {
    this.worker?.terminate();
    this.worker = null;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      const { reject } = this.pending;
      this.pending = null;
      const error = new Error(message);
      error.workerLost = true;
      reject(error);
    }
  }

  request(method, payload, transfer = []) {
    if (method !== "load" && !this.worker) {
      const error = new Error(
        "The PDF worker is no longer available. Select the PDF again.",
      );
      error.workerLost = true;
      return Promise.reject(error);
    }
    if (this.pending)
      return Promise.reject(
        new Error("A conversion request is already running."),
      );
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        this.worker = this.factory();
        this.worker.onmessage = ({ data }) => {
          if (!this.pending || data.id !== this.pending.id) return;
          const pending = this.pending;
          clearTimeout(pending.timer);
          this.pending = null;
          if (data.error) pending.reject(new Error(data.error));
          else pending.resolve(data.result);
        };
        this.worker.onerror = () =>
          this.dispose(
            "PDF processing stopped unexpectedly. Select the PDF again or try a simpler file.",
          );
        this.worker.onmessageerror = () =>
          this.dispose(
            "The browser could not read the PDF worker response. Select the PDF again.",
          );
      }
      const id = ++this.nextId;
      const timer = setTimeout(
        () =>
          this.dispose(
            "PDF processing exceeded 30 seconds and was stopped. Try a smaller or simpler PDF.",
          ),
        this.timeoutMs,
      );
      this.pending = { id, resolve, reject, timer };
      try {
        this.worker.postMessage({ id, method, payload }, transfer);
      } catch {
        this.dispose(
          "The PDF worker could not start. Reload the page and select the PDF again.",
        );
      }
    });
  }
}
