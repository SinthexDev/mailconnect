import assert from "node:assert/strict";
import test from "node:test";
import { applyFlagMode, buildPlainMessage, filterDirectChildren, inferDelimiter, normalizeFlag, resolveSentFolder, rewriteFolderPath, sentFolderPath, shouldSaveToSent } from "./imap-rules.js";

test("flags accept system names and custom keywords", () => {
  assert.equal(normalizeFlag("seen"), "\\Seen");
  assert.equal(normalizeFlag("\\flagged"), "\\Flagged");
  assert.equal(normalizeFlag("Rechnung"), "Rechnung");
  assert.deepEqual(applyFlagMode(["\\Seen"], "add", ["\\Flagged"]), ["\\Seen", "\\Flagged"]);
  assert.deepEqual(applyFlagMode(["\\Seen", "\\Flagged"], "remove", ["\\Seen"]), ["\\Flagged"]);
  assert.deepEqual(applyFlagMode(["\\Seen"], "set", ["\\Answered"]), ["\\Answered"]);
  assert.throws(() => normalizeFlag("\\Recent"));
  assert.throws(() => normalizeFlag("leer zeichen"));
});

test("the sent folder is the special-use folder, otherwise a known name", () => {
  assert.equal(sentFolderPath([
    { path: "INBOX", specialUse: null },
    { path: "INBOX.Gesendet", specialUse: "\\Sent" },
    { path: "Sent", specialUse: null },
  ]), "INBOX.Gesendet");
  assert.equal(sentFolderPath([
    { path: "INBOX", specialUse: null },
    { path: "INBOX.Sent Items", specialUse: null },
  ]), "INBOX.Sent Items");
  assert.equal(sentFolderPath([{ path: "INBOX", specialUse: null, selectable: true }]), null);
  assert.equal(sentFolderPath([{ path: "Sent", specialUse: "\\Sent", selectable: false }]), null);
  assert.equal(sentFolderPath([{ path: "Sent Messages", specialUse: null }]), "Sent Messages");
  assert.equal(resolveSentFolder([{ path: "Sent", specialUse: "\\Sent" }], "Gesendet"), "Gesendet");
  assert.equal(shouldSaveToSent(undefined, false), true);
  assert.equal(shouldSaveToSent(undefined, true), false);
  assert.equal(shouldSaveToSent(true, true), true);
  assert.equal(shouldSaveToSent(false, false), false);
});

test("direct children follow the delimiter that the paths already use", () => {
  const slash = ["INBOX", "INBOX/Arbeit", "INBOX/Arbeit/2024", "Archiv"];
  assert.equal(inferDelimiter(slash), "/");
  const children = filterDirectChildren(slash, "INBOX", (path) => path, slash);
  assert.deepEqual(children, ["INBOX/Arbeit"]);
  assert.deepEqual(filterDirectChildren(slash, "", (path) => path, slash), ["INBOX", "Archiv"]);

  const dot = ["INBOX", "INBOX.Sent", "INBOX.Sent.2024"];
  assert.equal(inferDelimiter(dot), ".");
  assert.deepEqual(filterDirectChildren(dot, "INBOX", (path) => path, dot), ["INBOX.Sent"]);
  assert.equal(rewriteFolderPath("INBOX.Sent.2024", "INBOX.Sent", "Archiv", "."), "Archiv.2024");
  assert.equal(rewriteFolderPath("INBOX", "INBOX.Sent", "Archiv", "."), null);
});

test("plain append keeps header lines out of the body", () => {
  const raw = buildPlainMessage({
    from: "ada@example.com",
    to: ["ben@example.com"],
    cc: [],
    subject: "Zeile\r\nBcc: evil@example.com",
    text: "Hallo",
    date: new Date("2026-10-15T08:00:00.000Z"),
  });
  assert.equal(raw.split("\r\n").some((line) => line.startsWith("Bcc:")), false);
  assert.match(raw, /^Subject: Zeile Bcc: evil@example.com$/m);
  assert.match(raw, /\r\n\r\nHallo$/);
});
