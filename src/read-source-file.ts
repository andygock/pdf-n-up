import { withDeadline } from "./async.ts";
import { detectPdfSignature, formatBytes, MAX_FILE_SIZE } from "./format.ts";
import { readBlob } from "./read-blob.ts";
import { getSourceFormat, hasImageSignature } from "./source-format.ts";

export async function readSourceFile(file: File, signal: AbortSignal) {
  if (!(file instanceof File))
    throw new Error("No readable file was selected.");
  if (!file.size) throw new Error("The selected file is empty.");
  if (file.size > MAX_FILE_SIZE)
    throw new Error(
      `The selected file exceeds the ${formatBytes(MAX_FILE_SIZE)} limit.`,
    );
  const format = getSourceFormat(file.name);
  if (!format)
    throw new Error(
      "Choose a file with a .pdf, .jpg, .jpeg or .png extension.",
    );
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const read = async () => {
      if (
        format === "pdf" &&
        !(await detectPdfSignature(file, controller.signal))
      )
        throw new Error(
          "The selected file does not contain a valid PDF header.",
        );
      if (
        format !== "pdf" &&
        !hasImageSignature(
          await readBlob(file.slice(0, 8), controller.signal),
          format,
        )
      )
        throw new Error(
          "The selected file does not contain a valid image header.",
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
