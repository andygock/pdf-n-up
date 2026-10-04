import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { preprocessCSS, resolveConfig } from "vite";

let config;

// Use Vite's real module mapping so component tests do not rely on global names.
export async function load(url, context, nextLoad) {
  if (!url.endsWith(".module.css")) return nextLoad(url, context);
  config ??= resolveConfig({ configFile: false }, "serve");
  const { modules } = await preprocessCSS(
    await readFile(new URL(url), "utf8"),
    fileURLToPath(url),
    await config,
  );
  return {
    format: "module",
    source: `export default ${JSON.stringify(modules)};`,
    shortCircuit: true,
  };
}
