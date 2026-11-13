import "./dom.js";
import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Ruler } from "../src/Ruler.tsx";

const mountRuler = async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(() =>
    root.render(
      createElement(Ruler, {
        page: {
          width: 720,
          height: 1440,
          displayWidth: 360,
          displayHeight: 720,
        },
      }),
    ),
  );
  return {
    container,
    close: async () => {
      await act(() => root.unmount());
      container.remove();
    },
  };
};

const key = async (element, value, options = {}) =>
  act(() =>
    element.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        bubbles: true,
        key: value,
        ...options,
      }),
    ),
  );

test("keyboard cursor creates, reads, adjusts, and clears a measurement", async () => {
  const { container, close } = await mountRuler();
  try {
    const svg = container.querySelector("svg");
    assert.equal(svg.tabIndex, 0);
    await act(() => svg.focus());
    await key(svg, "ArrowRight");
    assert.ok(container.querySelector("[data-ruler-keyboard-cursor]"));
    await key(svg, " ");
    await key(svg, "ArrowRight");
    await key(svg, "ArrowDown", { shiftKey: true });
    await key(svg, "Enter");

    let line = container.querySelector("[data-measurement-line]");
    assert.ok(line);
    assert.ok(Math.abs(Number(line.getAttribute("x1")) - 72 / 25.4) < 1e-10);
    assert.ok(
      Math.abs(Number(line.getAttribute("x2")) - (2 * 72) / 25.4) < 1e-10,
    );
    assert.ok(
      Math.abs(Number(line.getAttribute("y2")) - (10 * 72) / 25.4) < 1e-10,
    );
    assert.equal(
      container.querySelector('[aria-label="Ruler measurement"] strong')
        .textContent,
      "10.05 mm",
    );

    const end = container.querySelector('[data-ruler-endpoint="end"]');
    await act(() => end.focus());
    await key(end, "ArrowLeft");
    assert.equal(document.activeElement, end);
    line = container.querySelector("[data-measurement-line]");
    assert.ok(Math.abs(Number(line.getAttribute("x2")) - 72 / 25.4) < 1e-10);
    assert.equal(
      container.querySelector('[aria-label="Ruler measurement"] strong')
        .textContent,
      "10.00 mm",
    );

    assert.match(end.getAttribute("aria-label"), /X 1\.00 mm/);
    const readout = container.querySelector('[aria-label="Ruler measurement"]');
    assert.equal(readout.getAttribute("aria-live"), "polite");
    assert.match(readout.textContent, /D:\s*10\.00 mm/);

    await key(end, "Escape");
    assert.equal(container.querySelector("[data-measurement-line]"), null);
    assert.equal(readout.textContent, "D: —H: —V: —");
  } finally {
    await close();
  }
});

test("Pan mode restores touch panning and ignores measurement pointer starts", async () => {
  const { container, close } = await mountRuler();
  try {
    const svg = container.querySelector("svg");
    await act(() => svg.focus());
    await key(svg, " ");
    await key(svg, "ArrowRight");
    await key(svg, " ");
    assert.ok(container.querySelector("[data-measurement-line]"));
    const measure = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Measure",
    );
    const pan = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Pan",
    );

    await act(() => pan.focus());
    assert.equal(document.activeElement, pan);
    await act(() => pan.click());
    assert.equal(pan.getAttribute("aria-pressed"), "true");
    assert.equal(measure.getAttribute("aria-pressed"), "false");
    assert.equal(svg.style.touchAction, "pan-x pan-y");
    svg.setPointerCapture = () => {
      assert.fail("Pan mode must not capture pointer input");
    };
    const down = new window.MouseEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 10,
      clientY: 20,
    });
    Object.defineProperty(down, "pointerId", { value: 1 });
    await act(() => svg.dispatchEvent(down));
    await act(() =>
      svg.dispatchEvent(new window.Event("pointercancel", { bubbles: true })),
    );
    assert.ok(container.querySelector("[data-measurement-line]"));

    await act(() => measure.click());
    assert.equal(measure.getAttribute("aria-pressed"), "true");
    assert.equal(svg.style.touchAction, "none");
  } finally {
    await close();
  }
});

test("Escape does not clear the ruler while a text field has focus", async () => {
  const { container, close } = await mountRuler();
  try {
    const svg = container.querySelector("svg");
    await act(() => svg.focus());
    await key(svg, " ");
    await key(svg, "ArrowRight");
    await key(svg, " ");
    assert.ok(container.querySelector("[data-measurement-line]"));

    const input = document.createElement("input");
    container.append(input);
    await act(() => input.focus());
    await key(input, "Escape");
    assert.ok(container.querySelector("[data-measurement-line]"));
  } finally {
    await close();
  }
});
