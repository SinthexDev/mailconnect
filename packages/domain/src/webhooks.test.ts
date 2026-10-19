import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "./errors.js";
import { isFreshArrival, isPublicAddress, parseExcludedFolders, parseWebhookList, webhookFolderIncluded, webhookRequestHeaders } from "./webhooks.js";
import type { FolderCursor } from "./types.js";

function cursor(status: FolderCursor["status"]): FolderCursor {
  return {
    mailboxId: "box",
    folder: "INBOX",
    uidValidity: 1,
    lastUid: 4,
    indexedCount: 4,
    lastSyncAt: "2026-10-18T00:00:00.000Z",
    status,
    lastError: null,
  };
}

test("a caught-up folder reports new mail", () => {
  assert.equal(isFreshArrival(cursor("idle"), { reset: false, messages: [{}] }), true);
});

test("the first read of a folder is not a new-mail event", () => {
  assert.equal(isFreshArrival(undefined, { reset: false, messages: [{}] }), false);
  assert.equal(isFreshArrival(cursor("syncing"), { reset: false, messages: [{}] }), false);
  assert.equal(isFreshArrival(cursor("idle"), { reset: true, messages: [{}] }), false);
});

test("webhook addresses must be public https urls", () => {
  assert.deepEqual(parseWebhookList([" https://bot.example/hook ", "https://bot.example/hook"]), [{
    url: "https://bot.example/hook",
    method: "POST",
    secret: "",
    header: "",
    excludedFolders: [],
  }]);
  assert.throws(() => parseWebhookList(["http://bot.example/hook"]), (error: unknown) => error instanceof AppError && error.code === "invalid_webhook");
  assert.throws(() => parseWebhookList(["https://127.0.0.1/hook"]), (error: unknown) => error instanceof AppError && error.code === "invalid_webhook");
  assert.throws(() => parseWebhookList(["https://a.example", "https://b.example", "https://c.example", "https://d.example", "https://e.example", "https://f.example"]), (error: unknown) => error instanceof AppError && error.code === "too_many_webhooks");
});

test("a webhook keeps its method, key and header", () => {
  const [hook] = parseWebhookList([{
    url: "https://bot.example/hook",
    method: "PUT",
    secret: "geheim",
    header: "X-Api-Key: abc",
  }]);
  assert.equal(hook?.method, "PUT");
  assert.deepEqual(webhookRequestHeaders(hook!), {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "user-agent": "MailConnect",
      "x-api-key": "abc",
      authorization: "Bearer geheim",
    },
  });
});

test("an authorization header is sent as written", () => {
  const [hook] = parseWebhookList([{
    url: "https://bot.example/hook",
    secret: "geheim",
    header: "Authorization: Bearer crsr_test",
  }]);
  assert.equal(webhookRequestHeaders(hook!).headers.authorization, "Bearer crsr_test");
});

test("a header cannot break into a second line", () => {
  assert.throws(
    () => parseWebhookList([{ url: "https://bot.example/hook", header: "X-Test: a\r\nBcc: x" }]),
    (error: unknown) => error instanceof AppError && error.code === "invalid_webhook",
  );
});

test("each webhook keeps its own excluded folders", () => {
  const [hook] = parseWebhookList([{ url: "https://bot.example/hook", excludedFolders: ["INBOX.Spam", "INBOX.Spam"] }]);
  assert.deepEqual(hook?.excludedFolders, ["INBOX.Spam"]);
  const [open] = parseWebhookList([{ url: "https://bot.example/other" }]);
  assert.deepEqual(open?.excludedFolders, []);
});

test("an excluded folder stays quiet and every other folder still fires", () => {
  assert.deepEqual(parseExcludedFolders([" INBOX.Spam ", "INBOX.Spam", "Archiv"]), ["INBOX.Spam", "Archiv"]);
  assert.equal(webhookFolderIncluded("INBOX", ["INBOX.Spam"]), true);
  assert.equal(webhookFolderIncluded("INBOX.Spam", ["INBOX.Spam"]), false);
  assert.equal(webhookFolderIncluded("INBOX.Spam.Alt", ["INBOX.Spam"]), true);
  assert.throws(() => parseExcludedFolders(["INBOX\nSpam"]), (error: unknown) => error instanceof AppError && error.code === "invalid_webhook_folder");
});

test("private addresses are rejected", () => {
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("10.1.2.3"), false);
  assert.equal(isPublicAddress("192.168.1.9"), false);
  assert.equal(isPublicAddress("::1"), false);
  assert.equal(isPublicAddress("2001:4860:4860::8888"), true);
});
