import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "./errors.js";
import { outboundFrom } from "./from-name.js";

test("the mailbox display name is the sender name", () => {
  assert.deepEqual(outboundFrom("ada@example.com", "Ada | Example"), {
    name: "Ada | Example",
    address: "ada@example.com",
  });
});

test("fromName replaces the mailbox display name", () => {
  assert.deepEqual(outboundFrom("ada@example.com", "Ada | Example", "Ada"), {
    name: "Ada",
    address: "ada@example.com",
  });
});

test("an empty fromName keeps the mailbox display name", () => {
  assert.deepEqual(outboundFrom("ada@example.com", "Ada | Example", "  "), {
    name: "Ada | Example",
    address: "ada@example.com",
  });
});

test("a display name that is only the address is omitted", () => {
  assert.deepEqual(outboundFrom("ada@example.com", "ada@example.com"), {
    address: "ada@example.com",
  });
});

test("line breaks in a sender name cannot start a new header", () => {
  assert.deepEqual(outboundFrom("ada@example.com", "Ada\r\nBcc: x@y.z", "Ada\nLovelace"), {
    name: "Ada Lovelace",
    address: "ada@example.com",
  });
});

test("a fromName longer than 100 characters is rejected", () => {
  assert.throws(
    () => outboundFrom("ada@example.com", "Ada", "V".repeat(101)),
    (error: unknown) => error instanceof AppError && error.code === "from_name_too_long",
  );
});
