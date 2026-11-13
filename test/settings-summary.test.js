import "./dom.js";
import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ConversionOptions } from "../src/ConversionOptions.tsx";
import { DEFAULT_OPTIONS } from "../src/preferences.ts";

test("active summaries expose settings and bleed control applies a source selection", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const patches = [];
  try {
    await act(() =>
      root.render(
        createElement(ConversionOptions, {
          options: {
            ...DEFAULT_OPTIONS,
            paperMode: "custom",
            paperWidthMm: 220,
            paperHeightMm: 310,
            scaleMode: "percent",
            scalePercent: 80,
            layout: { custom: true, columns: 3, rows: 5, copies: 15 },
            bleedMm: 3,
          },
          processing: false,
          changeOptions: async (patch) => {
            patches.push(patch);
          },
        }),
      ),
    );
    const buttons = [...container.querySelectorAll("button")];
    assert.ok(buttons.some((button) => /Paper: 220/.test(button.textContent)));
    assert.ok(buttons.some((button) => /Scale: 80%/.test(button.textContent)));
    assert.ok(buttons.some((button) => /Custom: 3/.test(button.textContent)));
    const bleed = buttons.find((button) =>
      /Bleed \/ trim: 3/.test(button.textContent),
    );
    assert.ok(bleed);
    await act(() => bleed.click());
    const select = [...document.querySelectorAll("select")].find(
      (select) => select.value === "visible",
    );
    assert.ok(select);
    await act(() => {
      select.value = "trim";
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    assert.deepEqual(patches.at(-1), { sourceBox: "trim" });
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});
