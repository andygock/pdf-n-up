import assert from "node:assert/strict";
import test from "node:test";
import { createThumbnailController } from "../src/thumbnails.ts";

const canvas = () => ({
  width: 0,
  height: 0,
  draws: 0,
  getContext() {
    return { drawImage: () => this.draws++ };
  },
});
globalThis.document = { createElement: canvas };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const fixture = ({ loading, rendering } = {}) => {
  const stats = { loads: 0, destroys: 0, cancels: 0, pages: [] };
  const page = {
    getViewport: ({ scale }) => ({ width: 500 * scale, height: 800 * scale }),
    render: () => ({
      promise: rendering ?? Promise.resolve(),
      cancel: () => stats.cancels++,
    }),
    cleanup() {},
  };
  const library = {
    getDocument: () => {
      stats.loads++;
      return {
        promise:
          loading ??
          Promise.resolve({
            getPage: async (number) => {
              stats.pages.push(number);
              return page;
            },
          }),
        destroy: async () => {
          stats.destroys++;
        },
      };
    },
  };
  const file = new Blob(["pdf"]);
  return { stats, library, file };
};

test("thumbnail pagination reuses parsing, caps canvas sizes and destroys on close", async () => {
  const { stats, library, file } = fixture();
  const controller = createThumbnailController(file, {
    loadLibrary: async () => library,
  });
  const target = canvas();
  await controller.render([{ page: 1, canvas: target }]);
  await controller.render([{ page: 9, canvas: target }]);
  assert.equal(stats.loads, 1);
  assert.deepEqual(stats.pages, [1, 9]);
  assert.ok(target.width <= 192 && target.height <= 256);
  assert.equal(target.draws, 2);
  controller.dispose();
  assert.equal(stats.destroys, 1);
  await controller.render([{ page: 2, canvas: target }]);
  assert.equal(target.draws, 2);
});

test("closing while loading destroys the pending task and prevents later painting", async () => {
  const pending = deferred();
  const { stats, library, file } = fixture({ loading: pending.promise });
  const controller = createThumbnailController(file, {
    loadLibrary: async () => library,
  });
  const target = canvas();
  const rendering = controller.render([{ page: 1, canvas: target }]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  controller.dispose();
  await rendering;
  pending.resolve({
    getPage: async () => {
      throw new Error("A closed picker must not request pages");
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(stats.destroys, 1);
  assert.equal(target.draws, 0);
});

test("thumbnail deadline cancels drawing, releases parsing and allows retry", async () => {
  let current = fixture({ rendering: new Promise(() => {}) });
  const original = current;
  const controller = createThumbnailController(current.file, {
    loadLibrary: async () => current.library,
    timeoutMs: 15,
  });
  const target = canvas();
  await assert.rejects(
    controller.render([{ page: 1, canvas: target }]),
    /timed out/,
  );
  assert.equal(original.stats.cancels, 1);
  assert.equal(original.stats.destroys, 1);
  current = fixture();
  await controller.render([{ page: 1, canvas: target }]);
  assert.equal(target.draws, 1);
  controller.dispose();
});
