import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import type { Plugin } from "vite";

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const assetPrefix = "assets/pdfjs/";

export async function pdfjsAssetFiles() {
  const assets = new Map<string, string>();
  for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
    for (const entry of await readdir(join(pdfjsRoot, directory), {
      withFileTypes: true,
    })) {
      // QuickJS is only used by PDF scripting, which this preview never runs.
      if (!entry.isFile() || entry.name.startsWith("quickjs-eval.")) continue;
      assets.set(
        `${assetPrefix}${directory}/${entry.name}`,
        join(pdfjsRoot, directory, entry.name),
      );
    }
  }
  assets.set(`${assetPrefix}LICENSE`, join(pdfjsRoot, "LICENSE"));
  assets.set(
    "assets/pdf-lib/LICENSE.md",
    join(dirname(require.resolve("pdf-lib/package.json")), "LICENSE.md"),
  );
  return assets;
}

// PDF.js requests these resources by filename at runtime, so they cannot be
// discovered through the JavaScript import graph. Use the same inventory for
// development and build output, without creating a public/vendor directory.
export function pdfjsAssets(): Plugin {
  let base = "/";
  return {
    name: "pdfjs-assets",
    configResolved(config) {
      base = config.base.startsWith("/") ? config.base : "/";
    },
    async configureServer(server) {
      const assets = await pdfjsAssetFiles();
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://localhost")
          .pathname;
        const relative = pathname.startsWith(base)
          ? pathname.slice(base.length)
          : "";
        if (
          !relative.startsWith(assetPrefix) &&
          !relative.startsWith("assets/pdf-lib/")
        )
          return next();
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.end();
          return;
        }
        // Only exact inventory entries are served; request paths never become
        // filesystem paths, even if they contain encoded traversal sequences.
        const source = assets.get(relative);
        if (!source) {
          response.statusCode = 404;
          response.end();
          return;
        }
        try {
          const bytes = await readFile(source);
          const extension = extname(source);
          response.setHeader(
            "Content-Type",
            extension === ".js"
              ? "text/javascript"
              : extension === ".wasm"
                ? "application/wasm"
                : "application/octet-stream",
          );
          response.setHeader("Content-Length", bytes.length);
          response.end(request.method === "HEAD" ? undefined : bytes);
        } catch (error) {
          next(error);
        }
      });
    },
    async generateBundle() {
      for (const [fileName, source] of await pdfjsAssetFiles()) {
        this.emitFile({
          type: "asset",
          fileName,
          source: await readFile(source),
        });
      }
    },
  };
}
