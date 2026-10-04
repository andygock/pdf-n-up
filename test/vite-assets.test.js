import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";
import { pdfjsAssetFiles, pdfjsAssets } from "../build/pdfjs-assets.ts";

test("Vite emits the required PDF resources verbatim and excludes scripting", async () => {
  const inventory = await pdfjsAssetFiles();
  assert.ok(inventory.has("assets/pdfjs/wasm/openjpeg.wasm"));
  assert.ok(inventory.has("assets/pdfjs/wasm/jbig2.wasm"));
  assert.ok(inventory.has("assets/pdfjs/wasm/qcms_bg.wasm"));
  assert.ok(inventory.has("assets/pdfjs/cmaps/UniJIS-UTF16-H.bcmap"));
  assert.ok(
    inventory.has("assets/pdfjs/standard_fonts/LiberationSans-Regular.ttf"),
  );
  assert.ok(inventory.has("assets/pdfjs/iccs/CGATS001Compat-v2-micro.icc"));
  assert.ok(inventory.has("assets/pdfjs/LICENSE"));
  assert.ok(inventory.has("assets/pdf-lib/LICENSE.md"));
  assert.equal(
    [...inventory.keys()].some((name) => name.includes("quickjs")),
    false,
  );
  const emitted = [];
  await pdfjsAssets().generateBundle.call({
    emitFile: (asset) => emitted.push(asset),
  });
  assert.equal(emitted.length, inventory.size);
  for (const asset of emitted) {
    assert.equal(asset.type, "asset");
    assert.deepEqual(
      asset.source,
      await readFile(inventory.get(asset.fileName)),
    );
  }
});

test("Vite serves decoder assets directly from dependencies under a subdirectory", async () => {
  const server = await createServer({
    configFile: false,
    base: "/nested/",
    plugins: [pdfjsAssets()],
    server: { host: "127.0.0.1", port: 0 },
  });
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const path = "/nested/assets/pdfjs/wasm/openjpeg.wasm";
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/wasm");
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      await readFile(
        (await pdfjsAssetFiles()).get("assets/pdfjs/wasm/openjpeg.wasm"),
      ),
    );
    const head = await fetch(origin + path, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    const fallback = await fetch(
      `${origin}/nested/assets/pdfjs/wasm/openjpeg_nowasm_fallback.js`,
    );
    assert.equal(fallback.headers.get("content-type"), "text/javascript");
    for (const name of [
      "quickjs-eval.js",
      "quickjs-eval.wasm",
      "missing.wasm",
      "%2e%2e%2fpackage.json",
    ]) {
      assert.equal(
        (await fetch(`${origin}/nested/assets/pdfjs/wasm/${name}`)).status,
        404,
      );
    }
    assert.equal((await fetch(origin + path, { method: "POST" })).status, 405);
  } finally {
    await server.close();
  }
});
