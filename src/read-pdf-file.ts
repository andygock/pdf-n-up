import { withDeadline } from "./async.ts";
import { detectPdfSignature, formatBytes, MAX_FILE_SIZE } from "./format.ts";
import { readBlob } from "./read-blob.ts";

export async function readPdfFile(file: File, signal: AbortSignal) {
  if (!(file instanceof File))
    throw new Error("No readable file was selected.");
  if (!file.size) throw new Error("The selected file is empty.");
  if (file.size > MAX_FILE_SIZE)
    throw new Error(
      `The selected file exceeds the ${formatBytes(MAX_FILE_SIZE)} limit.`,
    );
  if (!file.name.toLowerCase().endsWith(".pdf"))
    throw new Error("The selected file does not have a .pdf extension.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const read = async () => {
      if (!(await detectPdfSignature(file, controller.signal)))
        throw new Error(
          "The selected file does not contain a valid PDF header.",
        );
      controller.signal.throwIfAborted();
      return readBlob(file, controller.signal);
    };
    return await withDeadline(
      read(),
      controller.signal,
      15000,
      "Reading the file timed out. Try selecting it again.",
    );
  } finally {
    controller.abort();
    signal.removeEventListener("abort", abort);
  }
}
