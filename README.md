# PDF N-Up

PDF N-Up is a small, client-side web app that arranges repeated copies of a
single PDF page on one sheet. It is useful for preparing print-ready sheets
while keeping the source page's visual content in PDF form rather than
rasterising it.

All document processing happens in the browser. Source and generated PDF data
is not uploaded to a server.

Demo: <https://andygock.github.io/pdf-n-up/>

## Features

- Drag-and-drop or file-picker input
- Validates that the source is a non-empty, single-page PDF
- Rejects encrypted, password-protected, malformed and multi-page files
- Accepts PDF files up to 50 MB, subject to the browser's available memory
- Supports 2-up (2×1), 4-up (2×2), 8-up (4×2), 9-up (3×3) and 16-up (4×4)
- Handles rotation, physical `/UserUnit` scaling and the CropBox/MediaBox intersection
- Converts valid blank pages, including pages without a content stream
- Automatically transposes rectangular grids for landscape source pages
- Expands the output sheet at 100% copy scale by default, or scales copies onto
  the visible source page size in whichever sheet orientation gives the best fit
- Identifies dimensions matching ISO A-series and common US paper sizes
- Generates the result entirely in browser memory and renders a PDF.js preview
- Lets the user explicitly open or download the generated PDF
- Supports outer margins and gaps between copies, measured in millimetres
- Offers cancellation, document clearing and preview retry
- Warns when annotations or form fields will not be copied
- Does not retain conversion history or document metadata in browser storage
- Responsive interface with keyboard-accessible controls

Interactive PDF features are outside the current imposition pipeline. Links,
annotations and form controls are not copied to the output, although their
visible appearances may remain part of the page content.

## How the layout works

With expanded paper, the output width is the visible source width multiplied by
the grid columns and the output height is multiplied by its rows. Copies remain
at 100%. With source-page size, the output uses the visible input dimensions and
copies are uniformly scaled and centred in each grid cell.

For example:

- 4-up (2×2) expanded paper is twice as wide and twice as high as the source
- 4-up source-page size uses 50% copies
- 8-up uses four columns and two rows for a portrait source

Rectangular grids are transposed for landscape pages. Source-page output also
compares portrait and landscape sheet orientations and chooses the larger fit.

PDF pages larger than 14,400 points (5,080 mm) on either output axis are
rejected for compatibility with common PDF readers. When expanded paper would
exceed that limit, choose source-page size instead. The validated source remains
available after an incompatible output choice, so it does not need to be selected again.

Margins and gaps default to zero. Expanded paper adds twice the outer margin
and one gap between each adjacent row or column, while retaining 100% copy scale.
Source-page size deducts this spacing from the available area before calculating
the best uniform fit. Print at actual size to preserve the generated dimensions.

The generated filename includes the selected layout. For example,
`handout.pdf` becomes `handout_8up.pdf` for an 8-up conversion.

## Use the app

1. Open the app in a current browser.
2. Select or drop a PDF containing exactly one page.
3. The app validates, converts and displays the result in an embedded preview.
4. Open the generated PDF in a new tab or download it when needed.

The application ships version-pinned copies of `pdf-lib` and PDF.js `6.2.108`,
including the worker, CMaps, standard fonts, ICC profiles and image decoders.
All runtime resources load from the same site; there are no CDN requests.

## Run locally

The deployed application contains only static HTML, CSS, JavaScript and a
vendored PDF libraries. It has no server-side processing or runtime build step.
Serve the complete `vendor/` directory so text and image decoders are available.
PDF generation and downloading still work if preview resources fail to load.

Serve the repository with any static web server. For example, with Python:

```sh
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

Do not open `index.html` through a `file://` URL. Browsers commonly block local
ES-module and worker loading in that context.

## Development checks

Node.js 22 or newer and pnpm are only required for contributor tooling and
refreshing the vendored libraries:

```sh
pnpm install
pnpm check
```

Useful individual commands are:

```sh
pnpm test
pnpm lint
pnpm lint:css
pnpm format:check
pnpm vendor
pnpm vendor --check
pnpm audit
```

`pnpm vendor` recreates `vendor/` from the exact dependency versions in
`pnpm-lock.yaml`. Commit regenerated vendor files together with dependency
updates. Regeneration builds a replacement before swapping it into place;
`--check` compares file inventory and bytes without changing the vendor files.

The repository enforces a seven-day `minimumReleaseAge` in `pnpm-workspace.yaml`.
Do not bypass it for dependency updates. Both PDF libraries are represented in
the lockfile and dependency audits. CI runs checks and audits for pull requests,
pushes and a weekly schedule; only the master branch can deploy.

Tests exercise the conversion engine with generated PDFs, physical scaling and
rotation, blank pages, spacing, invalid input, source retention, Japanese CMaps,
JPEG 2000 decoding, worker termination and preview cancellation. The async UI
tests use DOM doubles, and a Node transport adapter runs the shipped conversion
worker. They do not launch a browser or run smoke tests.

## Deploy

Copy these files and directories to any static web host:

```text
index.html
css/
js/
vendor/
icon.svg
favicon.ico
apple-touch-icon.png
```

No environment variables or database are required. The included GitHub Actions
workflow stages only these runtime files for GitHub Pages.

## Privacy

Selected PDF data and generated output remain in browser memory until the source
is replaced, cleared or the tab is closed. Generated object URLs are revoked when they
are no longer needed.

The app does not retain conversion history, filenames, file sizes, completion
times, source PDFs or generated PDFs in persistent browser storage.

The browser requests application code and PDF library resources from the site
host. Those requests reveal ordinary network metadata such as the user's IP
address, but do not include selected or generated PDF data. The Content Security
Policy restricts resource connections to this origin and permits WebAssembly
decoding without enabling JavaScript string evaluation.

The browser or operating system may temporarily write PDF data to disk while
processing or previewing it, including in a browser cache, temporary directory
or virtual-memory file. Their location and retention are controlled by the
browser and operating system. The completed PDF is saved to Downloads, or
another selected location, only when the user chooses Download.

Large or unusually complex PDFs may require several times their file size in
working memory. The 50 MB validation limit is an upper bound, not a guarantee
that every device can complete the conversion. Parsing and conversion each run
in a dedicated worker with a 30-second deadline. Cancel terminates that worker
and clears the document. A terminated worker's source must be selected again.
Generated PDFs above 100 MB are rejected after serialisation.

Preview runs independently, with an 8-second library-loading timeout and a
20-second overall deadline. It retries on request and rerenders when the panel
becomes visible or changes size. Preview canvases are capped at approximately
four million pixels; source images above 16 megapixels may be omitted from the
preview. Open the generated PDF in a PDF reader to check it before printing.

These are recovery measures, not a hard memory sandbox. Browsers do not expose
a per-worker heap limit, and a highly compressed or pathological PDF can still
exhaust memory before a deadline or output-size check takes effect.

## Project structure

- `index.html` — application markup, privacy copy and security policy
- `css/` — base, component and responsive styles
- `js/app.js` — event wiring and application initialisation
- `js/core.js` — shared state, DOM references and display formatting
- `js/geometry.js` — pure layout, rotation and page-size calculations
- `js/pdf.js` — file validation, conversion orchestration, opening and downloads
- `js/conversion.js` — PDF parsing and generation engine
- `js/conversion-worker.js`, `js/worker-client.js` — worker transport and watchdog
- `js/preview.js`, `js/async.js` — independent preview lifecycle and deadlines
- `js/ui.js` — status and document-detail rendering
- `js/navigation.js` — application view and mobile-navigation behaviour
- `js/dependencies.js` — lazy local PDF.js loading and auxiliary asset locations
- `vendor/` — pinned PDF libraries, auxiliary resources and licences
- `test/` — Node.js unit and PDF integration tests
- `scripts/` — contributor utilities, including vendor regeneration
- `icon.svg`, `favicon.ico`, `apple-touch-icon.png` — site icons

## Browser requirements

Use a current version of Chrome, Edge, Firefox or Safari with JavaScript enabled.
The app relies on ES modules, module workers, `File`, `Blob`, typed arrays,
`URL.createObjectURL`, `ResizeObserver`, `inert`, WebAssembly and canvas rendering.
