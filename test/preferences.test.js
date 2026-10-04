import "./dom.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OPTIONS,
  PREFERENCES_KEY,
  parsePreferences,
  readPreferences,
  savePreferences,
} from "../src/preferences.ts";

test("preferences round-trip only allowed settings and reset removes storage", () => {
  savePreferences({
    ...DEFAULT_OPTIONS,
    paperMode: "a4",
    name: "private.pdf",
    bytes: [1, 2],
  });
  assert.equal(readPreferences().paperMode, "a4");
  assert.ok(!localStorage.getItem(PREFERENCES_KEY).includes("private"));
  assert.ok(!localStorage.getItem(PREFERENCES_KEY).includes("bytes"));
  savePreferences(null);
  assert.equal(localStorage.getItem(PREFERENCES_KEY), null);
});
test("malformed and out-of-range preferences fall back safely", () => {
  for (const raw of [
    "{",
    "null",
    JSON.stringify({ ...DEFAULT_OPTIONS, marginMm: -1 }),
    JSON.stringify({
      ...DEFAULT_OPTIONS,
      layout: { rows: 20, columns: 20, copies: 400 },
    }),
  ]) {
    localStorage.setItem(PREFERENCES_KEY, raw);
    assert.equal(readPreferences(), null);
  }
  assert.equal(
    parsePreferences({ ...DEFAULT_OPTIONS, scalePercent: Infinity }),
    null,
  );
  localStorage.clear();
});
