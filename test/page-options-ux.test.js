import "./dom.js";
import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { PageOptions } from "../src/PageOptions.tsx";

const create = (props) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let currentProps = props;
  const render = (nextProps = currentProps) => {
    currentProps = nextProps;
    root.render(createElement(PageOptions, currentProps));
  };
  render();
  return {
    container,
    update: render,
    unmount() {
      root.unmount();
      container.remove();
    },
  };
};

const options = {
  layout: { copies: 4, columns: 2, rows: 2 },
  paperMode: "a4",
  mode: "repeat",
  pageRange: "",
  pageOrder: "rows",
};

const source = (pageNumber = 1, pageCount = 8) => ({
  name: "source.pdf",
  size: 100,
  pageCount,
  pageNumber,
  warnings: [],
  width: 100,
  height: 200,
  rotation: 0,
  userUnit: 1,
  cropBox: { x: 0, y: 0, width: 100, height: 200 },
});

function installDialog(dialog) {
  dialog.showModal = () => {
    dialog.open = true;
  };
  dialog.close = () => {
    dialog.open = false;
    dialog.dispatchEvent(new window.Event("close"));
  };
}

async function openDialog(container) {
  const dialog = container.querySelector("dialog");
  installDialog(dialog);
  await act(() => container.querySelector('[aria-haspopup="dialog"]').click());
  return dialog;
}

function setInputValue(input, value) {
  Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set.call(input, value);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}

test("page settings stay pending until Apply and run in options then source order", async () => {
  let root;
  let props;
  const calls = [];
  let finishPageSelection;
  props = {
    source: source(),
    sourceFile: null,
    options: { ...options },
    processing: false,
    changeOptions: async (patch) => {
      calls.push(["options", patch]);
      props = { ...props, options: { ...props.options, ...patch } };
      root.update(props);
      return true;
    },
    selectPage: (page) => {
      calls.push(["page", page]);
      return new Promise((resolve) => {
        finishPageSelection = resolve;
        props = { ...props, source: { ...props.source, pageNumber: page } };
        root.update(props);
      });
    },
  };
  await act(() => {
    root = create(props);
  });

  try {
    const dialog = await openDialog(root.container);
    await act(() =>
      setInputValue(root.container.querySelector("#sourcePage"), "2"),
    );
    await act(() => {
      const mode = root.container.querySelector("#pageMode");
      mode.value = "sequence";
      mode.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    await act(() =>
      setInputValue(root.container.querySelector("#pageRange"), "2-4"),
    );
    await act(() => {
      const order = root.container.querySelector("#pageOrder");
      order.value = "columns";
      order.dispatchEvent(new window.Event("change", { bubbles: true }));
    });

    assert.deepEqual(calls, []);
    assert.equal(
      root.container
        .querySelector('[role="status"]')
        .textContent.includes("pending"),
      true,
    );
    await act(() => dialog.close());
    assert.match(
      root.container.querySelector('[aria-haspopup="dialog"]').textContent,
      /changes pending/,
    );

    const reopened = await openDialog(root.container);
    assert.equal(root.container.querySelector("#pageRange").value, "2-4");
    assert.equal(root.container.querySelector("#pageOrder").value, "columns");
    const apply = [...reopened.querySelectorAll("button")].find(
      (button) => button.textContent === "Apply pages",
    );
    await act(async () => {
      apply.click();
      await new Promise((resolve) => setImmediate(resolve));
    });

    assert.deepEqual(calls, [
      ["options", { mode: "sequence", pageRange: "2-4", pageOrder: "columns" }],
      ["page", 2],
    ]);
    assert.equal(reopened.open, true);
    assert.equal(apply.disabled, true);
    await act(async () => {
      finishPageSelection(true);
      await new Promise((resolve) => setImmediate(resolve));
    });
    assert.equal(reopened.open, false);
    assert.doesNotMatch(
      root.container.querySelector('[aria-haspopup="dialog"]').textContent,
      /changes pending/,
    );
  } finally {
    await act(() => root.unmount());
  }
});

test("invalid ranges are checked against the selected source and keep the dialog open", async () => {
  const calls = [];
  const props = {
    source: source(1, 4),
    sourceFile: null,
    options: { ...options, mode: "sequence", pageRange: "1-2" },
    processing: false,
    changeOptions: async (patch) => calls.push(patch),
    selectPage: async () => true,
  };
  let root;
  await act(() => {
    root = create(props);
  });
  try {
    const dialog = await openDialog(root.container);
    await act(() =>
      setInputValue(root.container.querySelector("#pageRange"), "1-5"),
    );
    await act(() =>
      [...dialog.querySelectorAll("button")]
        .find((button) => button.textContent === "Apply pages")
        .click(),
    );
    assert.equal(dialog.open, true);
    assert.equal(calls.length, 0);
    assert.match(
      dialog.querySelector('[role="alert"]').textContent,
      /pages 1-4/,
    );
    assert.equal(
      root.container
        .querySelector("#pageRange")
        .getAttribute("aria-describedby"),
      "pageOptionsError",
    );
  } finally {
    await act(() => root.unmount());
  }
});

test("Enter and Apply do nothing without changes, and Discard clears drafts", async () => {
  const calls = [];
  const props = {
    source: null,
    sourceFile: null,
    options: { ...options, mode: "sequence", pageRange: "1-2" },
    processing: false,
    changeOptions: async (patch) => calls.push(patch),
    selectPage: async () => true,
  };
  let root;
  await act(() => {
    root = create(props);
  });
  try {
    const dialog = await openDialog(root.container);
    const apply = [...dialog.querySelectorAll("button")].find(
      (button) => button.textContent === "Apply pages",
    );
    assert.equal(apply.disabled, true);
    await act(() => {
      root.container
        .querySelector("#pageRange")
        .dispatchEvent(
          new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      apply.click();
    });
    assert.deepEqual(calls, []);
    assert.equal(dialog.open, true);

    await act(() =>
      setInputValue(root.container.querySelector("#pageRange"), "3-4"),
    );
    await act(() =>
      [...dialog.querySelectorAll("button")]
        .find((button) => button.textContent === "Discard changes")
        .click(),
    );
    assert.deepEqual(calls, []);
    assert.equal(dialog.open, false);
    assert.equal(
      root.container
        .querySelector('[aria-haspopup="dialog"]')
        .textContent.includes("changes pending"),
      false,
    );
  } finally {
    await act(() => root.unmount());
  }
});
