import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "./errors.js";
import { MAX_OUTBOUND_ATTACHMENT_BYTES, prepareOutboundAttachments } from "./outbound-attachments.js";

test("an attachment keeps its name and bytes", () => {
  const [file] = prepareOutboundAttachments([
    { filename: "ordner/Mockup.png", contentType: "image/png", contentBase64: Buffer.from("png").toString("base64"), contentId: "mockup" },
  ]);
  assert.equal(file?.filename, "Mockup.png");
  assert.equal(file?.contentType, "image/png");
  assert.equal(file?.contentId, "mockup");
  assert.equal(Buffer.from(file?.content ?? []).toString(), "png");
});

test("a filename cannot carry a path or a header break", () => {
  const [file] = prepareOutboundAttachments([
    { filename: "..\\..\\bericht.pdf\r\nBcc: x", contentBase64: Buffer.from("a").toString("base64") },
  ]);
  assert.equal(file?.filename, "bericht.pdfBcc: x");
});

test("an empty filename is rejected", () => {
  assert.throws(
    () => prepareOutboundAttachments([{ filename: "../", contentBase64: Buffer.from("a").toString("base64") }]),
    (error: unknown) => error instanceof AppError && error.code === "bad_attachment",
  );
});

test("broken base64 is rejected", () => {
  assert.throws(
    () => prepareOutboundAttachments([{ filename: "a.zip", contentBase64: "!!!!" }]),
    (error: unknown) => error instanceof AppError && error.message === "Der Anhang ist kein gültiges Base64.",
  );
});

test("attachments together may not exceed 20 MB", () => {
  const bytes = Buffer.alloc(MAX_OUTBOUND_ATTACHMENT_BYTES - 1, 1);
  const huge = Buffer.alloc(2, 1);
  assert.throws(
    () => prepareOutboundAttachments([
      { filename: "eins.bin", contentBase64: bytes.toString("base64") },
      { filename: "zwei.bin", contentBase64: huge.toString("base64") },
    ]),
    (error: unknown) => error instanceof AppError && error.code === "attachment_too_large",
  );
});
