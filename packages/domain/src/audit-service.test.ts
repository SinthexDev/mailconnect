import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAgentName, redactForAudit } from "./audit-service.js";

test("redaction hides secrets and shrinks attachments", () => {
  const out = redactForAudit({
    password: "geheim",
    webhooks: [{ url: "https://x.example", secret: "s3", header: "Authorization: Bearer abc" }],
    attachments: [{ filename: "a.pdf", contentBase64: "A".repeat(400) }],
    html: "<p>x</p>",
    subject: "Hallo",
  }) as Record<string, unknown>;
  assert.equal(out.password, "[redacted]");
  assert.deepEqual(out.webhooks, [{ url: "https://x.example", secret: "[redacted]", header: "[redacted]" }]);
  assert.deepEqual(out.attachments, [{ filename: "a.pdf", contentBase64: "[300 Bytes]" }]);
  assert.equal(out.html, "[HTML, 8 Zeichen]");
  assert.equal(out.subject, "Hallo");
});

test("agent names are trimmed, cleaned and capped", () => {
  assert.equal(normalizeAgentName("  Support \n Nora  "), "Support Nora");
  assert.equal(normalizeAgentName(""), null);
  assert.equal(normalizeAgentName(42), null);
  assert.equal(normalizeAgentName("x".repeat(200))?.length, 80);
});
