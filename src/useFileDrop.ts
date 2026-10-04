import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import type { View } from "./useView.ts";

export function useFileDrop(
  processing: boolean,
  selectFiles: (files: FileList) => Promise<void>,
  setView: Dispatch<SetStateAction<View>>,
) {
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  useEffect(() => {
    // One viewport-level drop handler also covers replacement files. The overlay
    // receives drops over the embedded viewer, which has its own document.
    const dragEnter = (event: DragEvent) => {
      event.preventDefault();
      if (!event.dataTransfer?.types.includes("Files")) return;
      dragDepth.current += 1;
      if (!processing) setDragging(true);
    };
    const dragOver = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer)
        event.dataTransfer.dropEffect = processing ? "none" : "copy";
    };
    const resetDrag = () => {
      dragDepth.current = 0;
      setDragging(false);
    };
    const dragLeave = (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    };
    const drop = async (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      resetDrag();
      const files = event.dataTransfer?.files;
      if (!files?.length || processing) return;
      window.location.hash = "#view-convert";
      setView("convert");
      await selectFiles(files);
    };
    window.addEventListener("dragenter", dragEnter);
    window.addEventListener("dragover", dragOver);
    window.addEventListener("dragleave", dragLeave);
    window.addEventListener("drop", drop);
    window.addEventListener("dragend", resetDrag);
    window.addEventListener("blur", resetDrag);
    return () => {
      window.removeEventListener("dragenter", dragEnter);
      window.removeEventListener("dragover", dragOver);
      window.removeEventListener("dragleave", dragLeave);
      window.removeEventListener("drop", drop);
      window.removeEventListener("dragend", resetDrag);
      window.removeEventListener("blur", resetDrag);
    };
  }, [processing, selectFiles, setView]);
  return dragging;
}
