import assert from "node:assert/strict";
import test from "node:test";
import { connectionError, missingMailbox } from "./mail-error.js";

test("imap auth failure becomes a readable error", () => {
  const error = Object.assign(new Error("Command failed"), {
    responseStatus: "NO",
    responseText: "someone@example.com Authentication failed",
    authenticationFailed: true,
    executedCommand: "LOGIN someone secret-password",
  });
  const appError = connectionError("IMAP", error);
  assert.equal(appError.status, 400);
  assert.equal(appError.message, "IMAP: Der Server hat Benutzername oder Passwort abgelehnt.");
  assert.equal(appError.message.includes("secret-password"), false);
});

test("a dropped imap connection stays readable", () => {
  const error = Object.assign(new Error("Connection not available"), { code: "ETIMEOUT" });
  const appError = connectionError("IMAP", error);
  assert.equal(appError.message, "IMAP: Die Verbindung ist abgebrochen. Der Abgleich versucht es erneut.");
});

test("a missing folder is recognized without treating every failure as missing", () => {
  assert.equal(missingMailbox(Object.assign(new Error("Command failed"), { responseText: "Mailbox does not exist" })), true);
  assert.equal(missingMailbox(new Error("Socket timeout")), false);
});

test("stopping a sync is not stored as a mailbox error", () => {
  assert.throws(() => connectionError("IMAP", new Error("paused")), /paused/);
});

test("other imap failures keep the server text", () => {
  const error = Object.assign(new Error("Command failed"), {
    responseStatus: "BAD",
    responseText: "System error",
  });
  const appError = connectionError("IMAP", error);
  assert.equal(appError.message, "IMAP: System error");
});
