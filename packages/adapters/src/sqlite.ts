import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { rewriteFolderPath } from "@mailconnect/domain";
import type {
  ApiToken,
  ApiTokenRepository,
  CredentialKind,
  CredentialRepository,
  EncryptedBlob,
  FolderCursor,
  FolderPull,
  IndexedMessage,
  Invite,
  InviteRepository,
  Mailbox,
  MailboxRepository,
  MessageIndexRepository,
  SearchQuery,
  SessionRepository,
  StoredAppend,
  StoredFlag,
  UidRelocation,
  User,
  UserRepository,
} from "@mailconnect/domain";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS mailboxes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  webhooks TEXT NOT NULL DEFAULT '[]',
  webhook_excluded_folders TEXT NOT NULL DEFAULT '[]',
  signatures TEXT NOT NULL DEFAULT '[]',
  email TEXT NOT NULL,
  provider_id TEXT,
  imap_host TEXT,
  imap_port INTEGER,
  imap_secure INTEGER,
  imap_username TEXT,
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_secure INTEGER,
  smtp_username TEXT,
  sent_folder TEXT NOT NULL DEFAULT '',
  server_stores_sent INTEGER NOT NULL DEFAULT 0,
  index_status TEXT NOT NULL,
  indexed_count INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT,
  last_error TEXT,
  error_streak INTEGER NOT NULL DEFAULT 0,
  retry_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credentials (
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('imap', 'smtp')),
  ciphertext BLOB NOT NULL,
  iv BLOB NOT NULL,
  auth_tag BLOB NOT NULL,
  key_version INTEGER NOT NULL,
  PRIMARY KEY (mailbox_id, kind)
);

CREATE TABLE IF NOT EXISTS folder_sync (
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  folder TEXT NOT NULL,
  uid_validity INTEGER,
  last_uid INTEGER NOT NULL DEFAULT 0,
  indexed_count INTEGER NOT NULL DEFAULT 0,
  remote_count INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT,
  status TEXT NOT NULL,
  last_error TEXT,
  PRIMARY KEY (mailbox_id, folder)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  folder TEXT NOT NULL,
  uid INTEGER NOT NULL,
  message_id TEXT,
  thread_id TEXT,
  from_addr TEXT NOT NULL DEFAULT '',
  to_addr TEXT NOT NULL DEFAULT '',
  cc_addr TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  date TEXT,
  flags TEXT NOT NULL DEFAULT '[]',
  has_attachments INTEGER NOT NULL DEFAULT 0,
  snippet TEXT NOT NULL DEFAULT '',
  body_hash TEXT,
  UNIQUE (mailbox_id, folder, uid)
);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  subject,
  from_addr,
  to_addr,
  snippet,
  content='messages',
  content_rowid='rowid'
);
`;

const TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, subject, from_addr, to_addr, snippet)
  VALUES (new.rowid, new.subject, new.from_addr, new.to_addr, new.snippet);
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, subject, from_addr, to_addr, snippet)
  VALUES ('delete', old.rowid, old.subject, old.from_addr, old.to_addr, old.snippet);
END;
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, subject, from_addr, to_addr, snippet)
  VALUES ('delete', old.rowid, old.subject, old.from_addr, old.to_addr, old.snippet);
  INSERT INTO messages_fts(rowid, subject, from_addr, to_addr, snippet)
  VALUES (new.rowid, new.subject, new.from_addr, new.to_addr, new.snippet);
END;
`;

type MailboxRow = {
  id: string;
  user_id: string;
  display_name: string;
  description: string;
  instructions: string;
  webhooks: string;
  webhook_excluded_folders: string;
  signatures: string;
  email: string;
  provider_id: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_secure: number | null;
  imap_username: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: number | null;
  smtp_username: string | null;
  sent_folder: string;
  server_stores_sent: number;
  index_status: Mailbox["indexStatus"];
  indexed_count: number;
  last_sync_at: string | null;
  last_error: string | null;
  error_streak: number;
  retry_at: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  mailbox_id: string;
  folder: string;
  uid: number;
  message_id: string | null;
  thread_id: string | null;
  from_addr: string;
  to_addr: string;
  cc_addr: string;
  subject: string;
  date: string | null;
  flags: string;
  has_attachments: number;
  snippet: string;
  body_hash: string | null;
};

function channel(
  host: string | null,
  port: number | null,
  secure: number | null,
  username: string | null,
): Mailbox["imap"] {
  if (!host || !port || !username || secure === null) return null;
  return { host, port, secure: secure === 1, username };
}

function storedFolderList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : []);
  } catch {
    return [];
  }
}

function storedWebhooks(value: string | null, inheritedFolders: string[]): Mailbox["webhooks"] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (typeof item === "string" && item.trim()) {
        return [{ url: item.trim(), method: "POST" as const, secret: "", header: "", excludedFolders: inheritedFolders }];
      }
      if (!item || typeof item !== "object") return [];
      const record = item as { url?: unknown; method?: unknown; secret?: unknown; header?: unknown; excludedFolders?: unknown };
      if (typeof record.url !== "string" || !record.url.trim()) return [];
      const method = record.method === "PUT" || record.method === "PATCH" ? record.method : "POST";
      const ownFolders = Array.isArray(record.excludedFolders)
        ? record.excludedFolders.flatMap((folder) => typeof folder === "string" && folder.trim() ? [folder.trim()] : [])
        : inheritedFolders;
      return [{
        url: record.url.trim(),
        method,
        secret: typeof record.secret === "string" ? record.secret : "",
        header: typeof record.header === "string" ? record.header : "",
        excludedFolders: ownFolders,
      }];
    });
  } catch {
    return [];
  }
}

function storedSignatures(value: string | null | undefined): Mailbox["signatures"] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as { id?: unknown; title?: unknown; kind?: unknown; body?: unknown; instructions?: unknown; isDefault?: unknown };
      const id = typeof record.id === "string" ? record.id : "";
      const title = typeof record.title === "string" ? record.title : "";
      const kind = record.kind === "html" || record.kind === "plain" ? record.kind : null;
      if (!id || !title || !kind) return [];
      return [{
        id,
        title,
        kind,
        body: typeof record.body === "string" ? record.body : "",
        instructions: typeof record.instructions === "string" ? record.instructions : "",
        isDefault: record.isDefault === true,
      }];
    });
  } catch {
    return [];
  }
}

function mapMailbox(row: MailboxRow): Mailbox {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    description: row.description,
    instructions: row.instructions,
    webhooks: storedWebhooks(row.webhooks, storedFolderList(row.webhook_excluded_folders)),
    webhookExcludedFolders: storedFolderList(row.webhook_excluded_folders),
    signatures: storedSignatures(row.signatures),
    email: row.email,
    providerId: row.provider_id,
    imap: channel(row.imap_host, row.imap_port, row.imap_secure, row.imap_username),
    smtp: channel(row.smtp_host, row.smtp_port, row.smtp_secure, row.smtp_username),
    sentFolder: row.sent_folder ?? "",
    serverStoresSent: row.server_stores_sent === 1,
    indexStatus: row.index_status,
    indexedCount: row.indexed_count,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
    errorStreak: row.error_streak,
    retryAt: row.retry_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): IndexedMessage {
  return {
    id: row.id,
    mailboxId: row.mailbox_id,
    folder: row.folder,
    uid: row.uid,
    messageId: row.message_id,
    threadId: row.thread_id,
    from: row.from_addr,
    to: row.to_addr,
    cc: row.cc_addr,
    subject: row.subject,
    date: row.date,
    flags: parseFlags(row.flags),
    hasAttachments: row.has_attachments === 1,
    snippet: row.snippet,
  };
}

function parseFlags(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

const PLAIN_HEADER = Buffer.from("SQLite format 3\0");

function isPlaintextFile(filename: string): boolean {
  if (!existsSync(filename)) return false;
  const fd = openSync(filename, "r");
  try {
    const buf = Buffer.alloc(16);
    const read = readSync(fd, buf, 0, 16, 0);
    return read === 16 && buf.equals(PLAIN_HEADER);
  } finally {
    closeSync(fd);
  }
}

function armCipher(db: Database.Database): void {
  db.pragma("cipher = 'sqlcipher'");
  db.pragma("legacy = 4");
}

function tune(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
}

function assertReadable(db: Database.Database): void {
  db.prepare("SELECT count(*) AS c FROM sqlite_master").get();
}

function removeSidecars(filename: string): void {
  rmSync(`${filename}-wal`, { force: true });
  rmSync(`${filename}-shm`, { force: true });
}

function openDatabase(filename: string, key: Buffer): Database.Database {
  if (key.length !== 32) throw new Error("MAILCONNECT_MASTER_KEY muss 32 Bytes lang sein.");
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  if (filename !== ":memory:" && isPlaintextFile(filename)) return encryptExisting(filename, key);
  const db = new Database(filename);
  armCipher(db);
  db.key(key);
  try {
    assertReadable(db);
  } catch (error) {
    db.close();
    const message = error instanceof Error ? error.message : "";
    if (message.includes("not a database")) {
      throw new Error("Die Datenbank lässt sich mit MAILCONNECT_MASTER_KEY nicht öffnen.");
    }
    throw error;
  }
  tune(db);
  if (filename !== ":memory:") rmSync(`${filename}.before-encrypt`, { force: true });
  if (isPlaintextFile(filename)) {
    db.close();
    return encryptExisting(filename, key);
  }
  return db;
}

function encryptExisting(filename: string, key: Buffer): Database.Database {
  const staging = new Database(filename);
  staging.pragma("wal_checkpoint(TRUNCATE)");
  staging.close();
  removeSidecars(filename);
  const backup = `${filename}.before-encrypt`;
  copyFileSync(filename, backup);
  console.log("MailConnect verschlüsselt die Datenbankdatei.");
  const db = new Database(filename);
  try {
    armCipher(db);
    db.rekey(key);
    assertReadable(db);
    tune(db);
    if (isPlaintextFile(filename)) {
      throw new Error("Die Datenbankdatei ist nach dem Verschlüsseln noch im Klartext.");
    }
  } catch (error) {
    db.close();
    copyFileSync(backup, filename);
    rmSync(backup, { force: true });
    removeSidecars(filename);
    throw error;
  }
  rmSync(backup, { force: true });
  return db;
}

export class SqliteDatabase {
  readonly db: Database.Database;
  readonly users: UserRepository;
  readonly invites: InviteRepository;
  readonly sessions: SessionRepository;
  readonly tokens: ApiTokenRepository;
  readonly mailboxes: MailboxRepository;
  readonly credentials: CredentialRepository;
  readonly messages: MessageIndexRepository;

  constructor(filename: string, key: Buffer) {
    this.db = openDatabase(filename, key);
    this.migrate();
    this.users = new UserRepo(this.db);
    this.invites = new InviteRepo(this.db);
    this.sessions = new SessionRepo(this.db);
    this.tokens = new TokenRepo(this.db);
    this.mailboxes = new MailboxRepo(this.db);
    this.credentials = new CredentialRepo(this.db);
    this.messages = new MessageRepo(this.db);
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    const current = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
    if (!current) this.db.exec(SCHEMA);
    this.db.exec(SCHEMA);
    this.db.exec(TRIGGERS);
    const version = this.db.prepare("SELECT version FROM schema_migrations WHERE version = 1").get();
    if (!version) this.db.prepare("INSERT INTO schema_migrations (version) VALUES (1)").run();
    const columns = this.db.prepare("PRAGMA table_info(mailboxes)").all() as Array<{ name: string }>;
    for (const name of ["description", "instructions"]) {
      if (!columns.some((column) => column.name === name)) {
        this.db.exec(`ALTER TABLE mailboxes ADD COLUMN ${name} TEXT NOT NULL DEFAULT ''`);
      }
    }
    if (!columns.some((column) => column.name === "webhooks")) {
      this.db.exec("ALTER TABLE mailboxes ADD COLUMN webhooks TEXT NOT NULL DEFAULT '[]'");
    }
    if (!columns.some((column) => column.name === "webhook_excluded_folders")) {
      this.db.exec("ALTER TABLE mailboxes ADD COLUMN webhook_excluded_folders TEXT NOT NULL DEFAULT '[]'");
    }
    if (!columns.some((column) => column.name === "sent_folder")) {
      this.db.exec("ALTER TABLE mailboxes ADD COLUMN sent_folder TEXT NOT NULL DEFAULT ''");
    }
    if (!columns.some((column) => column.name === "server_stores_sent")) {
      this.db.exec("ALTER TABLE mailboxes ADD COLUMN server_stores_sent INTEGER NOT NULL DEFAULT 0");
    }
    if (!columns.some((column) => column.name === "signatures")) {
      this.db.exec("ALTER TABLE mailboxes ADD COLUMN signatures TEXT NOT NULL DEFAULT '[]'");
    }
    const folderColumns = this.db.prepare("PRAGMA table_info(folder_sync)").all() as Array<{ name: string }>;
    if (!folderColumns.some((column) => column.name === "remote_count")) {
      this.db.exec("ALTER TABLE folder_sync ADD COLUMN remote_count INTEGER NOT NULL DEFAULT 0");
    }
  }
}

class UserRepo implements UserRepository {
  constructor(private readonly db: Database.Database) {}

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
    return row.c;
  }

  insert(user: User): void {
    this.db
      .prepare("INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(user.id, user.email, user.passwordHash, user.role, user.createdAt);
  }

  findByEmail(email: string): User | null {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as
      | { id: string; email: string; password_hash: string; role: User["role"]; created_at: string }
      | undefined;
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash, role: row.role, createdAt: row.created_at } : null;
  }

  findById(id: string): User | null {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
      | { id: string; email: string; password_hash: string; role: User["role"]; created_at: string }
      | undefined;
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash, role: row.role, createdAt: row.created_at } : null;
  }

  updatePassword(id: string, passwordHash: string): void {
    this.db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, id);
  }
}

class InviteRepo implements InviteRepository {
  constructor(private readonly db: Database.Database) {}

  insert(invite: Invite, tokenHash: string): void {
    this.db
      .prepare(
        `INSERT INTO invites (id, token_hash, email, created_by, expires_at, used_at, used_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(invite.id, tokenHash, invite.email, invite.createdBy, invite.expiresAt, invite.usedAt, invite.usedBy, invite.createdAt);
  }

  findByTokenHash(tokenHash: string): Invite | null {
    const row = this.db.prepare("SELECT * FROM invites WHERE token_hash = ?").get(tokenHash) as
      | {
          id: string;
          email: string | null;
          created_by: string;
          expires_at: string;
          used_at: string | null;
          used_by: string | null;
          created_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      createdBy: row.created_by,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      usedBy: row.used_by,
      createdAt: row.created_at,
    };
  }

  markUsed(id: string, usedAt: string, usedBy: string): void {
    this.db.prepare("UPDATE invites SET used_at = ?, used_by = ? WHERE id = ?").run(usedAt, usedBy, id);
  }

  listByCreator(userId: string): Invite[] {
    const rows = this.db.prepare("SELECT * FROM invites WHERE created_by = ? ORDER BY created_at DESC").all(userId) as Array<{
      id: string;
      email: string | null;
      created_by: string;
      expires_at: string;
      used_at: string | null;
      used_by: string | null;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      createdBy: row.created_by,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      usedBy: row.used_by,
      createdAt: row.created_at,
    }));
  }
}

class SessionRepo implements SessionRepository {
  constructor(private readonly db: Database.Database) {}

  insert(id: string, userId: string, tokenHash: string, expiresAt: string, createdAt: string): void {
    this.db
      .prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, userId, tokenHash, expiresAt, createdAt);
  }

  findUserId(tokenHash: string): string | null {
    const row = this.db
      .prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?")
      .get(tokenHash) as { user_id: string; expires_at: string } | undefined;
    if (!row || row.expires_at < new Date().toISOString()) return null;
    return row.user_id;
  }

  deleteByTokenHash(tokenHash: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }

  deleteExpired(now: string): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  }
}

class TokenRepo implements ApiTokenRepository {
  constructor(private readonly db: Database.Database) {}

  insert(token: ApiToken, tokenHash: string): void {
    this.db
      .prepare(
        `INSERT INTO api_tokens (id, user_id, name, token_hash, created_at, revoked_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(token.id, token.userId, token.name, tokenHash, token.createdAt, token.revokedAt, token.lastUsedAt);
  }

  listByUser(userId: string): ApiToken[] {
    const rows = this.db.prepare("SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC").all(userId) as Array<{
      id: string;
      user_id: string;
      name: string;
      created_at: string;
      revoked_at: string | null;
      last_used_at: string | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
      lastUsedAt: row.last_used_at,
    }));
  }

  findUserIdByHash(tokenHash: string): string | null {
    const row = this.db
      .prepare("SELECT user_id FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL")
      .get(tokenHash) as { user_id: string } | undefined;
    return row?.user_id ?? null;
  }

  touch(tokenHash: string, at: string): void {
    this.db.prepare("UPDATE api_tokens SET last_used_at = ? WHERE token_hash = ?").run(at, tokenHash);
  }

  revoke(id: string, userId: string, at: string): boolean {
    const result = this.db
      .prepare("UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
      .run(at, id, userId);
    return result.changes > 0;
  }
}

class MailboxRepo implements MailboxRepository {
  constructor(private readonly db: Database.Database) {}

  insert(mailbox: Mailbox): void {
    this.write(mailbox, true);
  }

  update(mailbox: Mailbox): void {
    this.write(mailbox, false);
  }

  private write(mailbox: Mailbox, insert: boolean): void {
    const sql = insert
      ? `INSERT INTO mailboxes (
           id, user_id, display_name, description, instructions, webhooks, webhook_excluded_folders, signatures, email, provider_id,
           imap_host, imap_port, imap_secure, imap_username,
           smtp_host, smtp_port, smtp_secure, smtp_username,
           sent_folder, server_stores_sent,
           index_status, indexed_count, last_sync_at, last_error, error_streak, retry_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      : `UPDATE mailboxes SET
           display_name = ?, description = ?, instructions = ?, webhooks = ?, webhook_excluded_folders = ?, signatures = ?, email = ?, provider_id = ?,
           imap_host = ?, imap_port = ?, imap_secure = ?, imap_username = ?,
           smtp_host = ?, smtp_port = ?, smtp_secure = ?, smtp_username = ?,
           sent_folder = ?, server_stores_sent = ?,
           index_status = ?, indexed_count = ?, last_sync_at = ?, last_error = ?, error_streak = ?, retry_at = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`;
    const channelValues = [
      mailbox.imap?.host ?? null,
      mailbox.imap?.port ?? null,
      mailbox.imap ? (mailbox.imap.secure ? 1 : 0) : null,
      mailbox.imap?.username ?? null,
      mailbox.smtp?.host ?? null,
      mailbox.smtp?.port ?? null,
      mailbox.smtp ? (mailbox.smtp.secure ? 1 : 0) : null,
      mailbox.smtp?.username ?? null,
    ];
    if (insert) {
      this.db.prepare(sql).run(
        mailbox.id,
        mailbox.userId,
        mailbox.displayName,
        mailbox.description,
        mailbox.instructions,
        JSON.stringify(mailbox.webhooks),
        JSON.stringify(mailbox.webhookExcludedFolders ?? []),
        JSON.stringify(mailbox.signatures ?? []),
        mailbox.email,
        mailbox.providerId,
        ...channelValues,
        mailbox.sentFolder ?? "",
        mailbox.serverStoresSent ? 1 : 0,
        mailbox.indexStatus,
        mailbox.indexedCount,
        mailbox.lastSyncAt,
        mailbox.lastError,
        mailbox.errorStreak,
        mailbox.retryAt,
        mailbox.createdAt,
        mailbox.updatedAt,
      );
      return;
    }
    this.db.prepare(sql).run(
      mailbox.displayName,
      mailbox.description,
      mailbox.instructions,
      JSON.stringify(mailbox.webhooks),
      JSON.stringify(mailbox.webhookExcludedFolders ?? []),
      JSON.stringify(mailbox.signatures ?? []),
      mailbox.email,
      mailbox.providerId,
      ...channelValues,
      mailbox.sentFolder ?? "",
      mailbox.serverStoresSent ? 1 : 0,
      mailbox.indexStatus,
      mailbox.indexedCount,
      mailbox.lastSyncAt,
      mailbox.lastError,
      mailbox.errorStreak,
      mailbox.retryAt,
      mailbox.updatedAt,
      mailbox.id,
      mailbox.userId,
    );
  }

  delete(id: string, userId: string): boolean {
    const result = this.db.prepare("DELETE FROM mailboxes WHERE id = ? AND user_id = ?").run(id, userId);
    return result.changes > 0;
  }

  findById(id: string): Mailbox | null {
    const row = this.db.prepare("SELECT * FROM mailboxes WHERE id = ?").get(id) as MailboxRow | undefined;
    return row ? mapMailbox(row) : null;
  }

  listByUser(userId: string): Mailbox[] {
    const rows = this.db.prepare("SELECT * FROM mailboxes WHERE user_id = ? ORDER BY display_name").all(userId) as MailboxRow[];
    return rows.map(mapMailbox);
  }

  listIndexable(now: string): Mailbox[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM mailboxes
         WHERE imap_host IS NOT NULL
           AND index_status != 'disabled'
           AND index_status != 'paused'
           AND (retry_at IS NULL OR retry_at <= ?)
         ORDER BY COALESCE(last_sync_at, created_at) ASC`,
      )
      .all(now) as MailboxRow[];
    return rows.map(mapMailbox);
  }

  setSyncState(
    id: string,
    patch: Pick<Mailbox, "indexStatus" | "indexedCount" | "lastSyncAt" | "lastError" | "errorStreak" | "retryAt" | "updatedAt">,
  ): void {
    this.db
      .prepare(
        `UPDATE mailboxes
         SET index_status = ?, indexed_count = ?, last_sync_at = ?, last_error = ?, error_streak = ?, retry_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(patch.indexStatus, patch.indexedCount, patch.lastSyncAt, patch.lastError, patch.errorStreak, patch.retryAt, patch.updatedAt, id);
  }

  setIndexedCount(id: string, indexedCount: number, updatedAt: string): void {
    this.db.prepare("UPDATE mailboxes SET indexed_count = ?, updated_at = ? WHERE id = ?").run(indexedCount, updatedAt, id);
  }

  setWebhooks(id: string, userId: string, webhooks: Mailbox["webhooks"], updatedAt: string): boolean {
    const result = this.db
      .prepare("UPDATE mailboxes SET webhooks = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(JSON.stringify(webhooks), updatedAt, id, userId);
    return result.changes > 0;
  }

  setWebhookExcludedFolders(id: string, userId: string, folders: string[], updatedAt: string): boolean {
    const result = this.db
      .prepare("UPDATE mailboxes SET webhook_excluded_folders = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(JSON.stringify(folders), updatedAt, id, userId);
    return result.changes > 0;
  }

  setSignatures(id: string, userId: string, signatures: Mailbox["signatures"], updatedAt: string): boolean {
    const result = this.db
      .prepare("UPDATE mailboxes SET signatures = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(JSON.stringify(signatures), updatedAt, id, userId);
    return result.changes > 0;
  }
}

class CredentialRepo implements CredentialRepository {
  constructor(private readonly db: Database.Database) {}

  upsert(mailboxId: string, kind: CredentialKind, blob: EncryptedBlob): void {
    this.db
      .prepare(
        `INSERT INTO credentials (mailbox_id, kind, ciphertext, iv, auth_tag, key_version)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (mailbox_id, kind) DO UPDATE SET
           ciphertext = excluded.ciphertext,
           iv = excluded.iv,
           auth_tag = excluded.auth_tag,
           key_version = excluded.key_version`,
      )
      .run(mailboxId, kind, blob.ciphertext, blob.iv, blob.authTag, blob.keyVersion);
  }

  get(mailboxId: string, kind: CredentialKind): EncryptedBlob | null {
    const row = this.db.prepare("SELECT ciphertext, iv, auth_tag, key_version FROM credentials WHERE mailbox_id = ? AND kind = ?").get(mailboxId, kind) as
      | { ciphertext: Buffer; iv: Buffer; auth_tag: Buffer; key_version: number }
      | undefined;
    if (!row) return null;
    return { ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag, keyVersion: row.key_version };
  }

  delete(mailboxId: string, kind: CredentialKind): void {
    this.db.prepare("DELETE FROM credentials WHERE mailbox_id = ? AND kind = ?").run(mailboxId, kind);
  }
}

class MessageRepo implements MessageIndexRepository {
  constructor(private readonly db: Database.Database) {}

  listCursors(mailboxId: string): FolderCursor[] {
    return this.folderRows(mailboxId);
  }

  listFolders(mailboxId: string, userId: string): FolderCursor[] {
    const owned = this.db.prepare("SELECT id FROM mailboxes WHERE id = ? AND user_id = ?").get(mailboxId, userId);
    if (!owned) return [];
    return this.folderRows(mailboxId);
  }

  private folderRows(mailboxId: string): FolderCursor[] {
    const rows = this.db.prepare("SELECT * FROM folder_sync WHERE mailbox_id = ? ORDER BY folder").all(mailboxId) as Array<{
      mailbox_id: string;
      folder: string;
      uid_validity: number | null;
      last_uid: number;
      indexed_count: number;
      last_sync_at: string | null;
      status: FolderCursor["status"];
      last_error: string | null;
    }>;
    return rows.map((row) => ({
      mailboxId: row.mailbox_id,
      folder: row.folder,
      uidValidity: row.uid_validity,
      lastUid: row.last_uid,
      indexedCount: row.indexed_count,
      lastSyncAt: row.last_sync_at,
      status: row.status,
      lastError: row.last_error,
    }));
  }

  applyFolderPull(mailboxId: string, pull: FolderPull, syncedAt: string): string[] {
    const insert = this.db.prepare(
      `INSERT INTO messages (
         id, mailbox_id, folder, uid, message_id, thread_id, from_addr, to_addr, cc_addr,
         subject, date, flags, has_attachments, snippet, body_hash
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (mailbox_id, folder, uid) DO UPDATE SET
         message_id = excluded.message_id,
         thread_id = excluded.thread_id,
         from_addr = excluded.from_addr,
         to_addr = excluded.to_addr,
         cc_addr = excluded.cc_addr,
         subject = excluded.subject,
         date = excluded.date,
         flags = excluded.flags,
         has_attachments = excluded.has_attachments,
         snippet = excluded.snippet,
         body_hash = excluded.body_hash
       RETURNING id`,
    );
    const ids: string[] = [];
    const tx = this.db.transaction(() => {
      if (pull.reset) {
        this.db.prepare("DELETE FROM messages WHERE mailbox_id = ? AND folder = ?").run(mailboxId, pull.folder);
      }
      for (const message of pull.messages) {
        const row = insert.get(
          cryptoId(),
          mailboxId,
          pull.folder,
          message.uid,
          message.messageId,
          message.threadId,
          message.from,
          message.to,
          message.cc,
          message.subject,
          message.date,
          JSON.stringify(message.flags),
          message.hasAttachments ? 1 : 0,
          message.snippet,
          message.bodyHash,
        ) as { id: string };
        ids.push(row.id);
      }
      const count = this.db.prepare("SELECT COUNT(*) AS c FROM messages WHERE mailbox_id = ? AND folder = ?").get(mailboxId, pull.folder) as { c: number };
      this.db
        .prepare(
          `INSERT INTO folder_sync (mailbox_id, folder, uid_validity, last_uid, indexed_count, remote_count, last_sync_at, status, last_error)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT (mailbox_id, folder) DO UPDATE SET
             uid_validity = excluded.uid_validity,
             last_uid = excluded.last_uid,
             indexed_count = excluded.indexed_count,
             remote_count = excluded.remote_count,
             last_sync_at = excluded.last_sync_at,
             status = excluded.status,
             last_error = NULL`,
        )
        .run(mailboxId, pull.folder, pull.uidValidity, pull.highestUid, count.c, pull.remoteCount, syncedAt, pull.caughtUp ? "idle" : "syncing");
    });
    tx();
    return ids;
  }

  count(mailboxId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS c FROM messages WHERE mailbox_id = ?").get(mailboxId) as { c: number };
    return row.c;
  }

  progress(mailboxId: string) {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS folder_total,
                SUM(CASE WHEN status = 'idle' THEN 1 ELSE 0 END) AS folder_done,
                COALESCE(SUM(remote_count), 0) AS message_total
         FROM folder_sync WHERE mailbox_id = ?`,
      )
      .get(mailboxId) as { folder_total: number; folder_done: number | null; message_total: number };
    return {
      folderTotal: row.folder_total,
      folderDone: row.folder_done ?? 0,
      messageTotal: row.folder_total === 0 ? null : row.message_total,
    };
  }

  search(query: SearchQuery): IndexedMessage[] {
    const params: Array<string | number | null> = [query.userId];
    let sql = `
      SELECT m.* FROM messages m
      JOIN mailboxes b ON b.id = m.mailbox_id
      WHERE b.user_id = ?`;
    if (query.mailboxId) {
      sql += " AND m.mailbox_id = ?";
      params.push(query.mailboxId);
    }
    if (query.folder) {
      sql += " AND m.folder = ?";
      params.push(query.folder);
    }
    if (query.since) {
      sql += " AND m.date >= ?";
      params.push(query.since);
    }
    if (query.until) {
      sql += " AND m.date <= ?";
      params.push(query.until);
    }
    if (query.text) {
      sql += " AND m.rowid IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)";
      params.push(query.text);
    }
    if (query.flag) {
      sql += " AND EXISTS (SELECT 1 FROM json_each(m.flags) WHERE json_each.value = ?)";
      params.push(query.flag);
    }
    sql += " ORDER BY m.date DESC LIMIT ?";
    params.push(query.limit);
    const rows = this.db.prepare(sql).all(...params) as MessageRow[];
    return rows.map(mapMessage);
  }

  findById(id: string, userId: string): IndexedMessage | null {
    const row = this.db
      .prepare(
        `SELECT m.* FROM messages m
         JOIN mailboxes b ON b.id = m.mailbox_id
         WHERE m.id = ? AND b.user_id = ?`,
      )
      .get(id, userId) as MessageRow | undefined;
    return row ? mapMessage(row) : null;
  }

  stats(userId: string) {
    const row = this.db
      .prepare(
        `SELECT
           COUNT(*) AS mailbox_count,
           SUM(CASE WHEN imap_host IS NOT NULL THEN 1 ELSE 0 END) AS imap_count,
           SUM(CASE WHEN imap_host IS NULL AND smtp_host IS NOT NULL THEN 1 ELSE 0 END) AS smtp_only,
           SUM(indexed_count) AS indexed_messages,
           SUM(CASE WHEN index_status = 'syncing' THEN 1 ELSE 0 END) AS syncing,
           SUM(CASE WHEN index_status = 'error' THEN 1 ELSE 0 END) AS errors,
           MAX(last_sync_at) AS last_sync_at
         FROM mailboxes WHERE user_id = ?`,
      )
      .get(userId) as {
      mailbox_count: number;
      imap_count: number | null;
      smtp_only: number | null;
      indexed_messages: number | null;
      syncing: number | null;
      errors: number | null;
      last_sync_at: string | null;
    };
    return {
      mailboxCount: row.mailbox_count,
      imapCount: row.imap_count ?? 0,
      smtpOnlyCount: row.smtp_only ?? 0,
      indexedMessages: row.indexed_messages ?? 0,
      syncing: row.syncing ?? 0,
      errors: row.errors ?? 0,
      lastSyncAt: row.last_sync_at,
    };
  }

  findInFolder(mailboxId: string, folder: string, uids: number[]): IndexedMessage[] {
    if (uids.length === 0) return [];
    const marks = uids.map(() => "?").join(", ");
    const rows = this.db.prepare(`SELECT * FROM messages WHERE mailbox_id = ? AND folder = ? AND uid IN (${marks})`).all(mailboxId, folder, ...uids) as MessageRow[];
    return rows.map(mapMessage);
  }

  applyDeletion(mailboxId: string, folder: string, uids: number[]): number {
    const remove = this.db.prepare("DELETE FROM messages WHERE mailbox_id = ? AND folder = ? AND uid = ?");
    return this.db.transaction(() => {
      for (const uid of uids) remove.run(mailboxId, folder, uid);
      this.adjustRemoteCount(mailboxId, folder, -uids.length);
      return this.refreshIndexedCounts(mailboxId);
    })();
  }

  applyMove(mailboxId: string, source: string, destination: string, moves: UidRelocation[], at: string): number {
    const remove = this.db.prepare("DELETE FROM messages WHERE mailbox_id = ? AND folder = ? AND uid = ?");
    const relocate = this.db.prepare("UPDATE messages SET folder = ?, uid = ? WHERE mailbox_id = ? AND folder = ? AND uid = ?");
    return this.db.transaction(() => {
      this.ensureFolder(mailboxId, destination, at);
      for (const move of moves) {
        if (move.destinationUid === null) remove.run(mailboxId, source, move.uid);
        else relocate.run(destination, move.destinationUid, mailboxId, source, move.uid);
      }
      this.adjustRemoteCount(mailboxId, source, -moves.length);
      this.adjustRemoteCount(mailboxId, destination, moves.length);
      return this.refreshIndexedCounts(mailboxId);
    })();
  }

  applyCopy(mailboxId: string, source: string, destination: string, moves: UidRelocation[], at: string): number {
    return this.db.transaction(() => {
      this.ensureFolder(mailboxId, destination, at);
      for (const move of moves) {
        if (move.destinationUid !== null) this.duplicateByUid(mailboxId, source, move.uid, destination, move.destinationUid);
      }
      this.adjustRemoteCount(mailboxId, destination, moves.length);
      return this.refreshIndexedCounts(mailboxId);
    })();
  }

  applyFlags(mailboxId: string, folder: string, updates: StoredFlag[]): void {
    const update = this.db.prepare("UPDATE messages SET flags = ? WHERE mailbox_id = ? AND folder = ? AND uid = ?");
    this.db.transaction(() => {
      for (const item of updates) update.run(JSON.stringify(item.flags), mailboxId, folder, item.uid);
    })();
  }

  applyAppend(mailboxId: string, message: StoredAppend, at: string): number {
    const insert = this.db.prepare(
      `INSERT INTO messages (
         id, mailbox_id, folder, uid, message_id, thread_id, from_addr, to_addr, cc_addr,
         subject, date, flags, has_attachments, snippet, body_hash
       ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, 0, ?, NULL)`,
    );
    return this.db.transaction(() => {
      this.ensureFolder(mailboxId, message.folder, at);
      insert.run(
        cryptoId(),
        mailboxId,
        message.folder,
        message.uid,
        message.from,
        message.to,
        message.cc,
        message.subject,
        message.date,
        JSON.stringify(message.flags),
        message.snippet,
      );
      this.db
        .prepare(
          `UPDATE folder_sync
           SET last_uid = ?
           WHERE mailbox_id = ? AND folder = ? AND last_uid > 0 AND last_uid < ?`,
        )
        .run(message.uid, mailboxId, message.folder, message.uid);
      this.adjustRemoteCount(mailboxId, message.folder, 1);
      return this.refreshIndexedCounts(mailboxId);
    })();
  }

  rewriteFolders(mailboxId: string, from: string, to: string, delimiter: string): void {
    const folders = this.db.prepare("SELECT folder FROM folder_sync WHERE mailbox_id = ?").all(mailboxId) as Array<{ folder: string }>;
    const renames = folders.flatMap((row) => {
      const next = rewriteFolderPath(row.folder, from, to, delimiter);
      return next && next !== row.folder ? [{ from: row.folder, to: next }] : [];
    });
    renames.sort((left, right) => right.from.length - left.from.length);
    const updateFolder = this.db.prepare("UPDATE folder_sync SET folder = ? WHERE mailbox_id = ? AND folder = ?");
    const messages = this.db.prepare("SELECT id, folder FROM messages WHERE mailbox_id = ?").all(mailboxId) as Array<{ id: string; folder: string }>;
    const updateMessage = this.db.prepare("UPDATE messages SET folder = ? WHERE id = ?");
    this.db.transaction(() => {
      for (const rename of renames) updateFolder.run(rename.to, mailboxId, rename.from);
      for (const message of messages) {
        const next = rewriteFolderPath(message.folder, from, to, delimiter);
        if (next && next !== message.folder) updateMessage.run(next, message.id);
      }
    })();
  }

  removeFolder(mailboxId: string, folder: string): number {
    return this.db.transaction(() => {
      this.db.prepare("DELETE FROM messages WHERE mailbox_id = ? AND folder = ?").run(mailboxId, folder);
      this.db.prepare("DELETE FROM folder_sync WHERE mailbox_id = ? AND folder = ?").run(mailboxId, folder);
      return this.refreshIndexedCounts(mailboxId);
    })();
  }

  ensureFolder(mailboxId: string, folder: string, at: string): void {
    this.db
      .prepare(
        `INSERT INTO folder_sync (mailbox_id, folder, uid_validity, last_uid, indexed_count, remote_count, last_sync_at, status, last_error)
         VALUES (?, ?, NULL, 0, 0, 0, ?, 'idle', NULL)
         ON CONFLICT (mailbox_id, folder) DO NOTHING`,
      )
      .run(mailboxId, folder, at);
  }

  private adjustRemoteCount(mailboxId: string, folder: string, delta: number): void {
    this.db
      .prepare("UPDATE folder_sync SET remote_count = MAX(0, remote_count + ?) WHERE mailbox_id = ? AND folder = ?")
      .run(delta, mailboxId, folder);
  }

  private refreshIndexedCounts(mailboxId: string): number {
    this.db
      .prepare(
        `UPDATE folder_sync SET indexed_count = (
           SELECT COUNT(*) FROM messages
           WHERE messages.mailbox_id = folder_sync.mailbox_id AND messages.folder = folder_sync.folder
         ) WHERE mailbox_id = ?`,
      )
      .run(mailboxId);
    return this.count(mailboxId);
  }

  private duplicateByUid(mailboxId: string, source: string, uid: number, destination: string, destinationUid: number): void {
    const row = this.db.prepare("SELECT * FROM messages WHERE mailbox_id = ? AND folder = ? AND uid = ?").get(mailboxId, source, uid) as MessageRow | undefined;
    if (!row) return;
    this.db
      .prepare(
        `INSERT INTO messages (
           id, mailbox_id, folder, uid, message_id, thread_id, from_addr, to_addr, cc_addr,
           subject, date, flags, has_attachments, snippet, body_hash
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        cryptoId(),
        mailboxId,
        destination,
        destinationUid,
        row.message_id,
        row.thread_id,
        row.from_addr,
        row.to_addr,
        row.cc_addr,
        row.subject,
        row.date,
        row.flags,
        row.has_attachments,
        row.snippet,
        row.body_hash,
      );
  }

  deleteMailboxData(mailboxId: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM messages WHERE mailbox_id = ?").run(mailboxId);
      this.db.prepare("DELETE FROM folder_sync WHERE mailbox_id = ?").run(mailboxId);
    });
    tx();
  }
}

function cryptoId(): string {
  return globalThis.crypto.randomUUID();
}
