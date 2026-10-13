import assert from "node:assert/strict";
import test from "node:test";
import { listAttachments, type StructureNode } from "./attachments.js";

test("a pdf attachment is listed with its filename", () => {
  const message: StructureNode = {
    type: "multipart/mixed",
    childNodes: [
      { part: "1", type: "text/plain" },
      {
        part: "2",
        type: "application/pdf",
        disposition: "attachment",
        dispositionParameters: { filename: "Rechnung 104.pdf" },
        size: 83000,
      },
    ],
  };
  assert.deepEqual(listAttachments(message), [
    { id: "2", filename: "Rechnung 104.pdf", contentType: "application/pdf", size: 83000 },
  ]);
});

test("a pdf named only in the content type is still listed", () => {
  const message: StructureNode = {
    type: "multipart/mixed",
    childNodes: [
      { part: "1", type: "text/html" },
      { part: "2", type: "application/pdf", parameters: { name: "invoice.pdf" }, size: 1200 },
    ],
  };
  assert.deepEqual(listAttachments(message), [
    { id: "2", filename: "invoice.pdf", contentType: "application/pdf", size: 1200 },
  ]);
});

test("a message that is itself a pdf is downloadable", () => {
  assert.deepEqual(listAttachments({ type: "application/pdf", size: 40 }), [
    { id: "1", filename: "anhang-1.pdf", contentType: "application/pdf", size: 40 },
  ]);
});

test("the message text is not treated as an attachment", () => {
  assert.deepEqual(listAttachments({ type: "text/plain", part: "1" }), []);
});

test("a filename cannot smuggle a path", () => {
  const listed = listAttachments({
    type: "application/pdf",
    disposition: "attachment",
    dispositionParameters: { filename: "../geheim/Rechnung.pdf" },
  });
  assert.equal(listed[0]?.filename, "Rechnung.pdf");
});
