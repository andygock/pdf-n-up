// Callers must also stop underlying worker/render tasks on timeout; rejecting
// a Promise by itself does not stop expensive work.
export const withDeadline = <T>(
  promise: PromiseLike<T>,
  signal: AbortSignal | null | undefined,
  timeoutMs: number,
  message: string,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    const finish = (error: unknown) => {
      cleanup();
      reject(error);
    };
    const abort = () =>
      finish(new DOMException("Operation cancelled", "AbortError"));
    const timer = setTimeout(() => finish(new Error(message)), timeoutMs);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then((value) => {
      cleanup();
      resolve(value);
    }, finish);
  });
