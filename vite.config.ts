import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { pdfjsAssets } from "./build/pdfjs-assets.ts";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    pdfjsAssets(),
    {
      name: "development-csp",
      apply: "serve",
      // Vite injects styles and a refresh preamble in development. Production
      // keeps the original strict policy and serves extracted, local assets.
      transformIndexHtml(html) {
        return html
          .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
          .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'");
      },
    },
  ],
});
