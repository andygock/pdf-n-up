# PDF 4-Up

PDF 4-Up is a small, client-side web app that places four copies of a single PDF page onto one larger page. It is useful for preparing print-ready sheets while keeping the original vector content, text, and images embedded in the PDF.

All document processing happens in the browser. Source and generated PDF files are not uploaded to a server.

Demo: <https://andygock.github.io/pdf-4up/>

## Features

- Drag-and-drop or file-picker input
- Validates that the source is a non-empty, single-page PDF
- Rejects encrypted, password-protected, malformed, and multi-page files
- Supports PDF files up to 200 MB
- Places four copies in a two-column by two-row layout
- Preserves portrait or landscape orientation
- Generates and downloads the result entirely in browser memory
- Stores only interface preferences and recent conversion metadata in `localStorage`
- Responsive interface with keyboard-accessible controls

## How the layout works

The output page uses the source page's proportions and increases both dimensions by `sqrt(2)`, corresponding to the next larger size in the ISO A-series. Each copy is scaled by `1 / sqrt(2)` and centred in its quadrant.

For example:

- A5 becomes A4
- A4 becomes A3
- A3 becomes A2
- Non-standard page sizes are enlarged proportionally

The generated filename is based on the source filename with `_4up` appended. For example, `handout.pdf` becomes `handout_4up.pdf`.

## Use the app

1. Open the app in a modern browser.
2. Select or drop a PDF containing exactly one page.
3. Select **Create 4-up PDF**.
4. Select **Download output**.

The first page load requires an internet connection because [`pdf-lib`](https://pdf-lib.js.org/) is loaded from jsDelivr. PDF conversion itself is performed locally after the library has loaded.

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

No server-side processing, environment variables, or database are required. The deployed site must allow the browser to load `pdf-lib` from `cdn.jsdelivr.net`.

## Privacy

Selected PDF bytes and generated output bytes remain in browser memory until the document is cleared, replaced, or the tab is closed. Object URLs used for downloads are revoked when they are no longer needed.

The app stores the active view and up to ten recent conversion metadata entries in `localStorage`. Metadata can include filenames, file sizes, and completion times; PDF contents are never stored there. Use **Clear history** in the app to remove this metadata.

## Project structure

- `index.html` — application markup and content
- `style.css` — responsive layout and visual styling
- `script.js` — validation, PDF generation, downloads, and local state
- `icon.svg`, `favicon.ico`, `apple-touch-icon.png` — site icons

## Browser requirements

Use a current version of Chrome, Edge, Firefox, or Safari with JavaScript enabled. The app relies on standard browser APIs including `File`, `Blob`, `URL.createObjectURL`, `localStorage`, and Web Crypto where available.

Very large PDFs may require substantial browser memory because both the source and generated document are held in memory during conversion.
