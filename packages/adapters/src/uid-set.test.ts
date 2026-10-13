import assert from "node:assert/strict";
import test from "node:test";
import { uidsFromSearch } from "./uid-set.js";

test("a compact uid set yields the next page", () => {
  const page = uidsFromSearch({ all: "1:2,10:11,40", count: 5 }, 0, 3);
  assert.deepEqual(page, { uids: [1, 2, 10], complete: false });
});

test("uids at or below the cursor are skipped", () => {
  const page = uidsFromSearch({ all: "5:8,20" }, 6, 10);
  assert.deepEqual(page, { uids: [7, 8, 20], complete: true });
});

test("a reversed range stays in ascending order", () => {
  const page = uidsFromSearch({ all: "10:8" }, 0, 10);
  assert.deepEqual(page, { uids: [8, 9, 10], complete: true });
});

test("an empty search result is complete", () => {
  assert.deepEqual(uidsFromSearch({ count: 0 }, 0, 80), { uids: [], complete: true });
  assert.deepEqual(uidsFromSearch([], 0, 80), { uids: [], complete: true });
});

test("a plain uid list is accepted", () => {
  const page = uidsFromSearch([4, 1, 9], 1, 80);
  assert.deepEqual(page, { uids: [4, 9], complete: true });
});

test("a count without the uid list is unusable", () => {
  assert.equal(uidsFromSearch({ count: 434 }, 0, 80), null);
  assert.equal(uidsFromSearch(false, 0, 80), null);
});
