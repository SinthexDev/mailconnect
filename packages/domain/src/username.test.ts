import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLogin, normalizeUsername } from "./username.js";

test("username accepts short handles and clears empty values", () => {
  assert.equal(normalizeUsername(null), null);
  assert.equal(normalizeUsername("  "), null);
  assert.equal(normalizeUsername("niko"), "niko");
  assert.equal(normalizeUsername("Niko_01"), "Niko_01");
  assert.throws(() => normalizeUsername("ab"));
  assert.throws(() => normalizeUsername("bad@name"));
  assert.throws(() => normalizeUsername("has space"));
});

test("login distinguishes email from username", () => {
  assert.deepEqual(normalizeLogin("hi@sinthex.de"), { kind: "email", value: "hi@sinthex.de" });
  assert.deepEqual(normalizeLogin("  Niko  "), { kind: "username", value: "Niko" });
  assert.throws(() => normalizeLogin(""));
});
