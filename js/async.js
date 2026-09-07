// Callers must also stop underlying worker/render tasks on timeout; rejecting
// a Promise by itself does not stop expensive work.
export const withDeadline = (promise, signal, timeoutMs, message) =>
  new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback(value);
    };
    const abort = () =>
      finish(reject, new DOMException("Operation cancelled", "AbortError"));
    const timer = setTimeout(
      () => finish(reject, new Error(message)),
      timeoutMs,
    );
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
