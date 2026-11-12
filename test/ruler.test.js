import "./dom.js";
import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Ruler } from "../src/Ruler.tsx";
import { rulerMeasurement, rulerPoint, rulerTicks } from "../src/ruler.ts";

test("ruler maps offset and scaled previews to physical PDF distances", () => {
  const page = { width: 720, height: 1440 };
  for (const scale of [0.25, 0.75, 1.5]) {
    const bounds = {
      left: 40,
      top: 80,
      width: page.width * scale,
      height: page.height * scale,
    };
    const start = rulerPoint({ x: 40, y: 80 }, bounds, page);
    const end = rulerPoint(
      { x: 40 + 216 * scale, y: 80 + 288 * scale },
      bounds,
      page,
    );
    const result = rulerMeasurement(start, end);
    assert.ok(Math.abs(result.distance - 127) < 1e-10);
    assert.ok(Math.abs(result.width - 76.2) < 1e-10);
    assert.ok(Math.abs(result.height - 101.6) < 1e-10);
    assert.deepEqual(rulerMeasurement(end, start), result);
  }
});

test("ruler clamps outside drags and preserves constrained angles at edges", () => {
  const page = { width: 200, height: 400 };
  const bounds = { left: 0, top: 0, ...page };
  assert.deepEqual(rulerPoint({ x: -20, y: 600 }, bounds, page), {
    x: 0,
    y: 400,
  });
  const start = { x: 100, y: 200 };
  const horizontal = rulerPoint({ x: 170, y: 210 }, bounds, page, start);
  assert.equal(horizontal.y, start.y);
  const diagonal = rulerPoint({ x: 400, y: 450 }, bounds, page, start);
  assert.ok(Math.abs(diagonal.x - 200) < 1e-10);
  assert.ok(Math.abs(diagonal.y - 300) < 1e-10);
});

test("scale ticks follow the origin and choose readable intervals at different sizes", () => {
  for (const displayLength of [100, 500, 1200]) {
    const ticks = rulerTicks(720, 360, displayLength);
    assert.ok(ticks.length < 110);
    assert.ok(
      ticks.every((tick) => tick.position >= 0 && tick.position <= 720),
    );
    assert.equal(ticks.find((tick) => tick.value === 0).position, 360);
    assert.ok(ticks.some((tick) => tick.value < 0));
    assert.ok(ticks.some((tick) => tick.value > 0));
    const major = ticks.filter((tick) => tick.major);
    if (major.length > 1) {
      assert.ok(
        ((major[1].position - major[0].position) / 720) * displayLength >=
          59.99,
      );
    }
  }
});

test("ruler captures drags, retains the measurement and supports clear and cancellation", async () => {
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
  try {
    const svg = container.querySelector("svg");
    svg.getBoundingClientRect = () => ({
      left: 10,
      top: 20,
      width: 360,
      height: 720,
    });
    let captured = null;
    svg.setPointerCapture = (id) => {
      captured = id;
    };
    svg.releasePointerCapture = (id) => {
      assert.equal(id, captured);
      captured = null;
    };
    const pointer = async (type, x, y, options = {}) => {
      const event = new window.MouseEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: y,
        ...options,
      });
      Object.defineProperty(event, "pointerId", { value: 1 });
      await act(() => svg.dispatchEvent(event));
    };
    await pointer("pointerdown", 10, 20, { button: 2 });
    assert.equal(captured, null);
    assert.equal(container.querySelector("[data-measurement-line]"), null);
    const coordinates = container.querySelector(
      '[aria-label="Ruler coordinates"]',
    );
    assert.equal(coordinates.textContent, "X: —Y: —");
    await pointer("pointermove", 118, 164);
    assert.equal(coordinates.textContent, "X: 76.20 mmY: 101.60 mm");
    assert.equal(
      container.querySelector('[data-ruler-marker="x"]').getAttribute("x1"),
      "216",
    );
    assert.equal(
      container.querySelector('[data-ruler-marker="y"]').getAttribute("y1"),
      "288",
    );
    assert.equal(container.querySelector("[data-measurement-line]"), null);
    await pointer("pointerout", 0, 0);
    assert.equal(coordinates.textContent, "X: —Y: —");
    assert.equal(container.querySelector("[data-ruler-marker]"), null);
    await pointer("pointerdown", 10, 20);
    assert.equal(captured, 1);
    await pointer("pointermove", 118, 164);
    assert.equal(container.querySelector("strong").textContent, "127.00 mm");
    await pointer("pointerup", 118, 164);
    assert.equal(captured, null);
    await pointer("pointermove", 200, 200);
    assert.equal(container.querySelector("strong").textContent, "127.00 mm");
    await act(() =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Clear measurement")
        .click(),
    );
    assert.equal(container.querySelector("[data-measurement-line]"), null);
    await pointer("pointerdown", 10, 20);
    await pointer("pointermove", 118, 30, { shiftKey: true });
    const line = container.querySelector("[data-measurement-line]");
    assert.equal(line.getAttribute("y1"), line.getAttribute("y2"));
    await act(() =>
      window.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Escape" }),
      ),
    );
    await pointer("pointermove", 200, 200);
    assert.equal(container.querySelector("[data-measurement-line]"), null);
    await pointer("pointerdown", 10, 20);
    await pointer("pointercancel", 30, 40);
    assert.equal(container.querySelector("[data-measurement-line]"), null);
    const originHandle = container.querySelector(
      '[aria-label^="Ruler origin"]',
    );
    const originEvent = new window.MouseEvent("pointerdown", {
      bubbles: true,
      clientX: 0,
      clientY: 0,
    });
    Object.defineProperty(originEvent, "pointerId", { value: 1 });
    await act(() => originHandle.dispatchEvent(originEvent));
    await pointer("pointermove", 190, 380);
    await pointer("pointerup", 190, 380);
    const zero = container.querySelector(
      '[aria-label="Move ruler zero point"] circle',
    );
    assert.equal(zero.getAttribute("cx"), "360");
    assert.equal(zero.getAttribute("cy"), "720");
    assert.equal(coordinates.textContent, "X: 0.00 mmY: 0.00 mm");
    await pointer("pointermove", 118, 164);
    assert.equal(coordinates.textContent, "X: -50.80 mmY: -152.40 mm");
    assert.equal(
      container.querySelector('[data-ruler-marker="x"]').getAttribute("x1"),
      "216",
    );
    assert.equal(
      container.querySelector('[data-ruler-marker="y"]').getAttribute("y1"),
      "288",
    );
    assert.equal(container.querySelector("[data-measurement-line]"), null);
    assert.ok(
      [...container.querySelectorAll("text")].some(
        (node) => Number(node.textContent) < 0,
      ),
    );
    await act(() =>
      originHandle.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          bubbles: true,
          key: "ArrowRight",
        }),
      ),
    );
    assert.ok(
      Math.abs(Number(zero.getAttribute("cx")) - (360 + 72 / 25.4)) < 1e-10,
    );
    const reset = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Reset origin",
    );
    await act(() => reset.click());
    assert.equal(zero.getAttribute("cx"), "0");
    assert.equal(zero.getAttribute("cy"), "0");
    assert.equal(coordinates.textContent, "X: 76.20 mmY: 101.60 mm");
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});
