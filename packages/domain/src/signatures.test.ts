import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "./errors.js";
import { removeSignature, upsertSignature } from "./signatures.js";
import type { MailSignature } from "./types.js";

const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

function draft(patch: Partial<Parameters<typeof upsertSignature>[1]> = {}) {
  return {
    title: "Standard",
    kind: "plain" as const,
    body: "Viele Grüße\nAda",
    instructions: "Nutze diese Signatur für normale Mails.",
    isDefault: false,
    ...patch,
  };
}

test("the first signature becomes the default", () => {
  const [signature] = upsertSignature([], draft(), id);
  assert.equal(signature?.isDefault, true);
  assert.equal(signature?.kind, "plain");
  assert.equal(signature?.body, "Viele Grüße\nAda");
});

test("a new default replaces the previous one", () => {
  const first = upsertSignature([], draft(), id);
  const both = upsertSignature(first, draft({ title: "Rechnung", kind: "html", body: "<p>Rechnung</p>", isDefault: true }), other);
  assert.deepEqual(both.map((item) => [item.title, item.isDefault]), [
    ["Standard", false],
    ["Rechnung", true],
  ]);
});

test("deleting the default promotes the next signature", () => {
  const list: MailSignature[] = [
    { id, title: "Standard", kind: "plain", body: "A", instructions: "", isDefault: true },
    { id: other, title: "Rechnung", kind: "html", body: "<p>B</p>", instructions: "Nur Rechnungen.", isDefault: false },
  ];
  const left = removeSignature(list, id);
  assert.equal(left.length, 1);
  assert.equal(left[0]?.isDefault, true);
  assert.equal(left[0]?.title, "Rechnung");
});

test("a signature needs a title and a known type", () => {
  assert.throws(() => upsertSignature([], draft({ title: "  " }), id), (error: unknown) => error instanceof AppError && error.code === "invalid_signature");
  assert.throws(() => upsertSignature([], draft({ kind: "markdown" as "plain" }), id), (error: unknown) => error instanceof AppError && error.code === "invalid_signature");
});
