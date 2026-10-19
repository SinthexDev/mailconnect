import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "./errors.js";
import { outboundFrom } from "./from-name.js";

test("the mailbox display name is the sender name", () => {
  assert.deepEqual(outboundFrom("vanessa@sinthex.de", "Vanessa | Sinthex"), {
    name: "Vanessa | Sinthex",
    address: "vanessa@sinthex.de",
  });
});

test("fromName replaces the mailbox display name", () => {
  assert.deepEqual(outboundFrom("vanessa@sinthex.de", "Vanessa | Sinthex", "Vanessa"), {
    name: "Vanessa",
    address: "vanessa@sinthex.de",
  });
});

test("an empty fromName keeps the mailbox display name", () => {
  assert.deepEqual(outboundFrom("vanessa@sinthex.de", "Vanessa | Sinthex", "  "), {
    name: "Vanessa | Sinthex",
    address: "vanessa@sinthex.de",
  });
});

test("a display name that is only the address is omitted", () => {
  assert.deepEqual(outboundFrom("vanessa@sinthex.de", "vanessa@sinthex.de"), {
    address: "vanessa@sinthex.de",
  });
});

test("line breaks in a sender name cannot start a new header", () => {
  assert.deepEqual(outboundFrom("vanessa@sinthex.de", "Vanessa\r\nBcc: x@y.z", "Ada\nLovelace"), {
    name: "Ada Lovelace",
    address: "vanessa@sinthex.de",
  });
});

test("a fromName longer than 100 characters is rejected", () => {
  assert.throws(
    () => outboundFrom("vanessa@sinthex.de", "Vanessa", "V".repeat(101)),
    (error: unknown) => error instanceof AppError && error.code === "from_name_too_long",
  );
});
