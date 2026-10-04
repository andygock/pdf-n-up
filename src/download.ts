interface SavePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    name: string;
    createWritable: () => Promise<FileSystemWritableFileStream>;
  }>;
}

export async function downloadPdf(blob: Blob, suggestedName: string) {
  const pickerWindow = window as SavePickerWindow;
  if (pickerWindow.showSaveFilePicker) {
    // Invoke the picker before awaiting anything to preserve the click gesture.
    const handle = await pickerWindow.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: "PDF document",
          accept: { "application/pdf": [".pdf"] },
        },
      ],
    });
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => {});
      throw error;
    }
    return { filename: handle.name, saved: true };
  }

  // Browsers without an embedded PDF viewer or save picker use their download
  // manager, whose save location and opening behaviour follow user preferences.
  const url = URL.createObjectURL(
    new Blob([blob], { type: "application/octet-stream" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName;
  try {
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Give the browser time to consume the URL before releasing its backing Blob.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return { filename: suggestedName, saved: false };
}
