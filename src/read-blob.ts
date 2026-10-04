// Cancelling the stream stops further reads; Blob.arrayBuffer() has no abort API.
export async function readBlob(
  blob: Blob,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  signal.throwIfAborted();
  const reader = blob.stream().getReader();
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const bytes = new Uint8Array(blob.size);
    let offset = 0;
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) return bytes.subarray(0, offset);
      bytes.set(value, offset);
      offset += value.length;
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
