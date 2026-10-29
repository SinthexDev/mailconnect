import assert from "node:assert/strict";
import test from "node:test";
import { mailPriorityHeaders, normalizeMailPriority } from "./mail-priority.js";

test("priority accepts high, normal, low and common aliases", () => {
  assert.equal(normalizeMailPriority(undefined), undefined);
  assert.equal(normalizeMailPriority("high"), "high");
  assert.equal(normalizeMailPriority("1"), "high");
  assert.equal(normalizeMailPriority("urgent"), "high");
  assert.equal(normalizeMailPriority("normal"), "normal");
  assert.equal(normalizeMailPriority("low"), "low");
  assert.equal(normalizeMailPriority("5"), "low");
  assert.throws(() => normalizeMailPriority(""));
  assert.throws(() => normalizeMailPriority("medium"));
});

test("high priority headers match common client expectations", () => {
  assert.equal(mailPriorityHeaders(undefined), undefined);
  assert.equal(mailPriorityHeaders("normal"), undefined);
  assert.deepEqual(mailPriorityHeaders("high"), {
    "X-Priority": "1 (Highest)",
    "X-MSMail-Priority": "High",
    Importance: "High",
  });
  assert.deepEqual(mailPriorityHeaders("low"), {
    "X-Priority": "5 (Lowest)",
    "X-MSMail-Priority": "Low",
    Importance: "Low",
  });
});
