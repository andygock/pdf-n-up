import "./dom.js";
import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { useView } from "../src/useView.ts";

test("hash navigation restores the main scroll position and working focus", async () => {
  window.history.replaceState(null, "", "/");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  function Harness() {
    const { view, mainRef, headingRef } = useView();
    return createElement(
      "main",
      { ref: mainRef },
      createElement(
        "section",
        { hidden: view !== "convert" },
        createElement(
          "button",
          { id: "selectFileButton", type: "button" },
          "Choose",
        ),
        createElement("input", { id: "workingField" }),
      ),
      createElement(
        "section",
        { hidden: view !== "guide" },
        createElement("h1", { ref: headingRef, tabIndex: -1 }, "Guide"),
      ),
    );
  }
  try {
    await act(() => root.render(createElement(Harness)));
    const main = container.querySelector("main");
    const field = container.querySelector("#workingField");
    await act(() => {
      main.scrollTop = 240;
      main.dispatchEvent(new window.Event("scroll"));
      field.focus();
      window.history.replaceState(null, "", "#view-guide");
      window.dispatchEvent(new window.HashChangeEvent("hashchange"));
    });
    assert.equal(main.scrollTop, 0);
    assert.equal(document.activeElement.tagName, "H1");
    await act(() => {
      main.scrollTop = 80;
      main.dispatchEvent(new window.Event("scroll"));
      window.history.replaceState(null, "", "#view-convert");
      window.dispatchEvent(new window.HashChangeEvent("hashchange"));
    });
    assert.equal(main.scrollTop, 240);
    assert.equal(document.activeElement, field);
  } finally {
    await act(() => root.unmount());
    container.remove();
    window.history.replaceState(null, "", "/");
  }
});
