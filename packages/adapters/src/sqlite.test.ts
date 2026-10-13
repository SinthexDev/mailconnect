import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { AuthService } from "@mailconnect/domain";
import { passwordHasher } from "./passwords.js";
import { createSecretHasher } from "./secrets.js";
import { SqliteDatabase } from "./sqlite.js";
import { AesGcmVault } from "./vault.js";
import Database from "better-sqlite3-multiple-ciphers";

test("auth, invite and full text index", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mailconnect-"));
  const db = new SqliteDatabase(join(dir, "test.sqlite"), randomBytes(32));
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
    description: "Rechnungen der Firma",
    instructions: "Spam darf gelöscht werden.",
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
  assert.equal(db.mailboxes.findById("box-1")?.description, "Rechnungen der Firma");
  assert.equal(db.mailboxes.findById("box-1")?.instructions, "Spam darf gelöscht werden.");
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
      remoteCount: 12,
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
  const progress = db.messages.progress("box-1");
  assert.equal(progress.messageTotal, 12);
  assert.equal(progress.folderTotal, 1);
  assert.equal(progress.folderDone, 1);
  const hidden = db.messages.search({ userId: accepted.user.id, text: '"Rechnung"', limit: 10 });
  assert.equal(hidden.length, 0);
  db.close();
});

test("plaintext database is encrypted in place and rejects the wrong key", () => {
  const dir = mkdtempSync(join(tmpdir(), "mailconnect-"));
  const file = join(dir, "plain.sqlite");
  const key = randomBytes(32);
  const plain = new Database(file);
  plain.exec("CREATE TABLE keep (note TEXT)");
  plain.prepare("INSERT INTO keep (note) VALUES (?)").run("Betreff geheim");
  plain.close();

  const db = new SqliteDatabase(file, key);
  const kept = db.db.prepare("SELECT note FROM keep").get() as { note: string };
  assert.equal(kept.note, "Betreff geheim");
  db.close();

  const header = readFileSync(file).subarray(0, 16).toString("utf8");
  assert.equal(header.startsWith("SQLite format 3"), false);
  assert.throws(() => new SqliteDatabase(file, randomBytes(32)), /MAILCONNECT_MASTER_KEY/);

  const again = new SqliteDatabase(file, key);
  const reopened = again.db.prepare("SELECT note FROM keep").get() as { note: string };
  assert.equal(reopened.note, "Betreff geheim");
  again.close();
});

test("adds a mailbox description to an existing database", () => {
  const dir = mkdtempSync(join(tmpdir(), "mailconnect-"));
  const file = join(dir, "old.sqlite");
  const key = randomBytes(32);
  const plain = new Database(file);
  plain.exec(`CREATE TABLE mailboxes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL,
    provider_id TEXT,
    imap_host TEXT, imap_port INTEGER, imap_secure INTEGER, imap_username TEXT,
    smtp_host TEXT, smtp_port INTEGER, smtp_secure INTEGER, smtp_username TEXT,
    index_status TEXT NOT NULL,
    indexed_count INTEGER NOT NULL DEFAULT 0,
    last_sync_at TEXT, last_error TEXT, error_streak INTEGER NOT NULL DEFAULT 0, retry_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  plain.prepare(
    "INSERT INTO mailboxes (id, user_id, display_name, email, index_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run("old-box", "user-1", "Alt", "alt@example.com", "idle", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  plain.close();

  const db = new SqliteDatabase(file, key);
  assert.equal(db.mailboxes.findById("old-box")?.description, "");
  assert.equal(db.mailboxes.findById("old-box")?.instructions, "");
  db.close();
});
