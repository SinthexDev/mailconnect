import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { AuthService } from "@mailconnect/domain";
import { passwordHasher } from "./passwords.js";
import { createSecretHasher } from "./secrets.js";
import { SqliteDatabase } from "./sqlite.js";
import { AesGcmVault } from "./vault.js";

test("auth, invite and full text index", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mailconnect-"));
  const db = new SqliteDatabase(join(dir, "test.sqlite"));
  const auth = new AuthService(
    db.users,
    db.invites,
    db.sessions,
    passwordHasher,
    createSecretHasher("x".repeat(40)),
    { newId: () => crypto.randomUUID() },
    { now: () => new Date().toISOString() },
  );
  const admin = await auth.bootstrapAdmin("admin@example.com", "correct-horse-battery");
  assert.equal(admin.role, "admin");
  await assert.rejects(() => auth.bootstrapAdmin("other@example.com", "correct-horse-battery"));

  const session = await auth.login("admin@example.com", "correct-horse-battery");
  assert.equal(auth.userFromSession(session.token)?.email, "admin@example.com");
  await assert.rejects(() => auth.login("admin@example.com", "wrong-password-value"));

  const invite = auth.createInvite(admin, null, 24);
  const accepted = await auth.acceptInvite(invite.token, "ada@example.com", "another-strong-password");
  assert.equal(accepted.user.role, "user");
  await assert.rejects(() => auth.acceptInvite(invite.token, "ada@example.com", "another-strong-password"));

  const vault = new AesGcmVault(randomBytes(32));
  const now = new Date().toISOString();
  db.mailboxes.insert({
    id: "box-1",
    userId: admin.id,
    displayName: "Arbeit",
    email: "admin@example.com",
    providerId: "custom",
    imap: { host: "imap.example", port: 993, secure: true, username: "admin@example.com" },
    smtp: null,
    indexStatus: "syncing",
    indexedCount: 0,
    lastSyncAt: null,
    lastError: null,
    errorStreak: 0,
    retryAt: null,
    createdAt: now,
    updatedAt: now,
  });
  db.credentials.upsert("box-1", "imap", vault.encrypt("secret-imap"));
  assert.equal(vault.decrypt(db.credentials.get("box-1", "imap")!), "secret-imap");

  db.messages.applyFolderPull(
    "box-1",
    {
      folder: "INBOX",
      uidValidity: 5,
      reset: false,
      caughtUp: true,
      highestUid: 8,
      messages: [
        {
          uid: 8,
          messageId: "a@example",
          threadId: "a@example",
          from: "Ada <ada@example.com>",
          to: "admin@example.com",
          cc: "",
          subject: "Rechnung März",
          date: now,
          flags: ["\\Seen"],
          hasAttachments: false,
          snippet: "Bitte die Rechnung prüfen",
          bodyHash: "abc",
        },
      ],
    },
    now,
  );
  const found = db.messages.search({ userId: admin.id, text: '"Rechnung"', limit: 10 });
  assert.equal(found.length, 1);
  assert.equal(found[0]?.subject, "Rechnung März");
  const hidden = db.messages.search({ userId: accepted.user.id, text: '"Rechnung"', limit: 10 });
  assert.equal(hidden.length, 0);
  db.close();
});
