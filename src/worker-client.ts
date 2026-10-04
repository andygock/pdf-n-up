import type {
  ConversionOptions,
  ConversionResult,
  LoadPayload,
  SourceMetadata,
  WorkerRequest,
  WorkerResponse,
} from "./types.ts";

export interface ConversionWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: WorkerRequest, transfer: Transferable[]): void;
  terminate(): void;
}

interface PendingRequest {
  id: number;
  resolve: (result: SourceMetadata | ConversionResult) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class WorkerLostError extends Error {
  readonly workerLost = true;
}

// One request at a time keeps the worker's retained source unambiguous. A
// deadline terminates the worker itself, rather than merely rejecting a Promise
// while untrusted parsing or decompression continues consuming resources.
export class ConversionWorkerClient {
  worker: ConversionWorker | null = null;
  private pending: PendingRequest | null = null;
  private nextId = 0;
  private readonly factory: () => ConversionWorker;
  private readonly timeoutMs: number;

  constructor(
    factory: () => ConversionWorker = () =>
      new Worker(new URL("./conversion-worker.ts", import.meta.url), {
        type: "module",
      }),
    timeoutMs = 30_000,
  ) {
    this.factory = factory;
    this.timeoutMs = timeoutMs;
  }

  dispose(message = "Processing cancelled. Select a PDF to start again.") {
    this.worker?.terminate();
    this.worker = null;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      const { reject } = this.pending;
      this.pending = null;
      reject(new WorkerLostError(message));
    }
  }

  request(method: "selectPage", payload: number): Promise<SourceMetadata>;
  request(
    method: "load",
    payload: LoadPayload,
    transfer?: Transferable[],
  ): Promise<SourceMetadata>;
  request(
    method: "generate",
    payload: ConversionOptions,
    transfer?: Transferable[],
  ): Promise<ConversionResult>;
  request(
    method: "load" | "generate" | "selectPage",
    payload: LoadPayload | ConversionOptions | number,
    transfer: Transferable[] = [],
  ): Promise<SourceMetadata | ConversionResult> {
    if (method !== "load" && !this.worker) {
      return Promise.reject(
        new WorkerLostError(
          "The PDF worker is no longer available. Select the PDF again.",
        ),
      );
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
          if ("error" in data) pending.reject(new Error(data.error));
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
        const message =
          method === "load"
            ? { id, method, payload: payload as LoadPayload }
            : method === "selectPage"
              ? { id, method, payload: payload as number }
              : { id, method, payload: payload as ConversionOptions };
        this.worker.postMessage(message, transfer);
      } catch {
        this.dispose(
          "The PDF worker could not start. Reload the page and select the PDF again.",
        );
      }
    });
  }
}
