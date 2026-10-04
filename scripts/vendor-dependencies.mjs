import {
  access,
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const publicRoot = path.join(projectRoot, "public");
const vendorRoot = path.join(publicRoot, "vendor");

if (path.dirname(vendorRoot) !== publicRoot) {
  throw new Error(
    "Refusing to replace a vendor directory outside the project.",
  );
}

const assets = [
  ["node_modules/pdf-lib/LICENSE.md", "pdf-lib/LICENSE.md"],
  ["node_modules/pdfjs-dist/build/pdf.mjs", "pdfjs-dist/pdf.mjs"],
  ["node_modules/pdfjs-dist/build/pdf.worker.mjs", "pdfjs-dist/pdf.worker.mjs"],
  ["node_modules/pdfjs-dist/LICENSE", "pdfjs-dist/LICENSE"],
  ...["cmaps", "standard_fonts", "wasm", "iccs"].map((directory) => [
    `node_modules/pdfjs-dist/${directory}`,
    `pdfjs-dist/${directory}`,
  ]),
];

// Build a complete replacement before touching the working vendor directory.
// Cleanup targets are checked children of this project or its public directory.
const staging = path.join(projectRoot, `.vendor-staging-${process.pid}`);
const backup = path.join(projectRoot, `.vendor-backup-${process.pid}`);
for (const target of [vendorRoot, staging, backup]) {
  if (
    path.dirname(path.resolve(target)) !==
    (target === vendorRoot ? publicRoot : projectRoot)
  )
    throw new Error("Unsafe vendor path.");
}
const inventory = async (root, prefix = "") => {
  const files = [];
  for (const entry of await readdir(path.join(root, prefix), {
    withFileTypes: true,
  })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...(await inventory(root, relative)));
    else files.push(relative);
  }
  return files.sort();
};
await Promise.all(
  assets.map(([source]) => access(path.join(projectRoot, source))),
);
await mkdir(staging); // Fail rather than overwrite a stale staging directory.
try {
  for (const [source, destination] of assets) {
    const destinationPath = path.join(staging, destination);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await cp(path.join(projectRoot, source), destinationPath, {
      recursive: true,
    });
  }
  let matches = false;
  try {
    const expected = await inventory(staging);
    const actual = await inventory(vendorRoot);
    matches = JSON.stringify(expected) === JSON.stringify(actual);
    if (matches) {
      for (const file of expected) {
        if (
          !(await readFile(path.join(staging, file))).equals(
            await readFile(path.join(vendorRoot, file)),
          )
        ) {
          matches = false;
          break;
        }
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (process.argv.includes("--check")) {
    if (!matches)
      throw new Error("Vendor assets differ or are missing. Run pnpm vendor.");
  } else if (!matches) {
    // Avoid replacing identical resources on every dev/build invocation,
    // especially while a local server holds files open on Windows.
    let backedUp = false;
    try {
      await rename(vendorRoot, backup);
      backedUp = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      await rename(staging, vendorRoot);
    } catch (error) {
      if (backedUp) await rename(backup, vendorRoot);
      throw error;
    }
    if (backedUp) await rm(backup, { recursive: true });
  }
} finally {
  await rm(staging, { recursive: true, force: true });
}
