import "./dom.js";
import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { SpacingInput } from "../src/SpacingInput.tsx";

test("numeric drafts explain invalid values after blur and Escape restores the value", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const commits = [];
  try {
    await act(() =>
      root.render(
        createElement(SpacingInput, {
          id: "number",
          min: 1,
          max: 10,
          step: 1,
          value: 3,
          disabled: false,
          onCommit: (value) => commits.push(value),
        }),
      ),
    );
    const input = container.querySelector("input");
    await act(() => {
      input.focus();
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set.call(input, "11");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    assert.equal(container.querySelector('[role="status"]'), null);
    await act(() => input.blur());
    assert.match(
      container.querySelector('[role="status"]').textContent,
      /1 to 10/,
    );
    assert.equal(
      input.getAttribute("aria-describedby"),
      container.querySelector('[role="status"]').id,
    );
    assert.deepEqual(commits, []);
    await act(() =>
      input.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    assert.equal(input.value, "3");
    assert.equal(container.querySelector('[role="status"]'), null);
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});
