import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Vite keeps the worker on the same origin and fingerprints it with the build.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export default pdfjs;
