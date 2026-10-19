import assert from "node:assert/strict";
import test from "node:test";
import { planSync } from "./sync-service.js";
import type { Mailbox } from "./types.js";

function box(patch: Partial<Mailbox> & Pick<Mailbox, "id" | "indexStatus">): Mailbox {
  return {
    userId: "user",
    displayName: patch.id,
    description: "",
    instructions: "",
    webhooks: [],
    webhookExcludedFolders: [],
    signatures: [],
    sentFolder: "",
    serverStoresSent: false,
    email: `${patch.id}@example.com`,
    providerId: null,
    imap: { host: "imap.example", port: 993, secure: true, username: "a" },
    smtp: null,
    indexedCount: 0,
    lastSyncAt: null,
    lastError: null,
    errorStreak: 0,
    retryAt: null,
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:00:00.000Z",
    ...patch,
  };
}

test("a named mailbox starts even when the user had stopped it", () => {
  const paused = box({ id: "paused", indexStatus: "paused" });
  assert.deepEqual(planSync([paused], "paused"), [{ mailbox: paused, start: true }]);
});

test("without a mailbox id every account starts except stopped and send-only", () => {
  const idle = box({ id: "idle", indexStatus: "idle" });
  const failed = box({ id: "failed", indexStatus: "error" });
  const paused = box({ id: "paused", indexStatus: "paused" });
  const sendOnly = box({ id: "smtp", indexStatus: "disabled", imap: null });
  const plan = planSync([idle, failed, paused, sendOnly]);
  assert.deepEqual(plan.map((item) => [item.mailbox.id, item.start]), [
    ["idle", true],
    ["failed", true],
    ["paused", false],
    ["smtp", false],
  ]);
});

test("an unknown mailbox id starts nothing", () => {
  assert.deepEqual(planSync([box({ id: "idle", indexStatus: "idle" })], "missing"), []);
});
