# PDF N-Up

PDF N-Up is a small, client-side web app that arranges repeated copies of a single PDF page on one sheet. It is useful for preparing print-ready sheets while keeping the original vector content, text, and images embedded in the PDF.

All document processing happens in the browser. Source and generated PDF files are not uploaded to a server.

Demo: <https://andygock.github.io/pdf-n-up/>

## Features

- Drag-and-drop or file-picker input
- Validates that the source is a non-empty, single-page PDF
- Rejects encrypted, password-protected, malformed, and multi-page files
- Supports PDF files up to 200 MB
- Supports 2-up (2×1), 4-up (2×2), 8-up (4×2), 9-up (3×3), and 16-up (4×4) layouts
- Automatically transposes rectangular grids for landscape source pages
- Expands the output sheet at 100% copy scale by default, or scales copies onto the source paper size
- Identifies dimensions matching ISO A-series and common US paper sizes
- Preserves portrait or landscape orientation
- Generates the result entirely in browser memory and renders an embedded PDF.js preview
- Lets the user explicitly open or download the generated PDF
- Does not retain conversion history or document metadata in browser storage
- Responsive interface with keyboard-accessible controls

## How the layout works

With expanded paper, the output width is the source width multiplied by the grid columns and the output height is multiplied by its rows. Copies remain at 100%. With source-size paper, the output retains the input dimensions and copies are uniformly scaled and centred in each grid cell.

For example:

- 4-up (2×2) expanded paper is twice as wide and twice as high as the source
- 4-up source-size paper uses 50% copies
- 8-up uses four columns and two rows

The generated filename includes the selected layout. For example, `handout.pdf` becomes `handout_8up.pdf` for an 8-up conversion.

## Use the app

1. Open the app in a modern browser.
2. Select or drop a PDF containing exactly one page.
3. The app validates, converts, and displays the result in an embedded preview.
4. Open the generated PDF in a new tab or download it when needed.

The first page load requires an internet connection because [`pdf-lib`](https://pdf-lib.js.org/) and [PDF.js](https://mozilla.github.io/pdf.js/) are loaded from jsDelivr. Only the version-pinned library files and PDF.js worker are requested from the CDN. Source and generated PDF bytes are provided directly to local JavaScript and the local browser worker; they are not uploaded to jsDelivr or another service.

## Run locally

This repository contains only static HTML, CSS, and JavaScript. No build step or package installation is required.

Serve the directory with any static web server. For example, with Python:

```sh
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

Opening `index.html` directly may also work, but a local HTTP server provides behavior closer to a deployed site.

## Deploy

Copy these files to any static web host:

```text
index.html
script.js
style.css
icon.svg
favicon.ico
apple-touch-icon.png
```

No server-side processing, environment variables, or database are required. The deployed site must allow the browser to load `pdf-lib`, PDF.js, and the PDF.js worker from `cdn.jsdelivr.net`.

## Privacy

Selected PDF bytes and generated output bytes remain in browser memory until the document is cleared, replaced, or the tab is closed. Object URLs used for downloads are revoked when they are no longer needed.

The app does not retain conversion history, filenames, file sizes, completion times, source PDFs, or generated PDFs in persistent browser storage.

The browser or operating system may temporarily write source or generated PDF data to disk during processing or previewing, including in a browser cache, a temporary directory such as `%TEMP%` on Windows, or virtual-memory files. Their location and retention are controlled by the browser and operating system. The completed PDF is only saved to the configured Downloads folder (or another selected location) if the user chooses Download.

## Project structure

- `index.html` — application markup and content
- `style.css` — responsive layout and visual styling
- `script.js` — validation, PDF generation, preview, downloads, and local state
- `icon.svg`, `favicon.ico`, `apple-touch-icon.png` — site icons

## Browser requirements

Use a current version of Chrome, Edge, Firefox, or Safari with JavaScript enabled. The app relies on standard browser APIs including `File`, `Blob`, and `URL.createObjectURL`.

Very large PDFs may require substantial browser memory because both the source and generated document are held in memory during conversion.
