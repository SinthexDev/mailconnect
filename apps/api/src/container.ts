import { randomUUID } from "node:crypto";
import {
  AesGcmVault,
  SqliteDatabase,
  createSecretHasher,
  imapAdapter,
  loadProviders,
  passwordHasher,
  smtpAdapter,
} from "@mailconnect/adapters";
import { AuthService, MailService, MailboxService, SyncService, TokenService } from "@mailconnect/domain";
import type { AppConfig } from "./config.js";
import { startIndexer, type Indexer } from "./worker.js";

export type Container = {
  config: AppConfig;
  db: SqliteDatabase;
  auth: AuthService;
  tokens: TokenService;
  mailboxes: MailboxService;
  mail: MailService;
  sync: SyncService;
  providers: ReturnType<typeof loadProviders>;
  indexer: Indexer;
};

export function createContainer(config: AppConfig): Container {
  const db = new SqliteDatabase(config.databasePath);
  const clock = { now: () => new Date().toISOString() };
  const ids = { newId: () => randomUUID() };
  const secrets = createSecretHasher(config.sessionSecret);
  const vault = new AesGcmVault(config.masterKey);
  const auth = new AuthService(db.users, db.invites, db.sessions, passwordHasher, secrets, ids, clock);
  const tokens = new TokenService(db.tokens, db.users, secrets, ids, clock);
  const sync = new SyncService(db.mailboxes, db.credentials, db.messages, vault, imapAdapter, clock, config.syncBatch);
  const mail = new MailService(db.mailboxes, db.credentials, db.messages, vault, imapAdapter, smtpAdapter);
  const nudge: { current: (id: string) => void } = { current: () => undefined };
  const mailboxes = new MailboxService(
    db.mailboxes,
    db.credentials,
    db.messages,
    vault,
    imapAdapter,
    smtpAdapter,
    ids,
    clock,
    (id) => nudge.current(id),
  );
  const indexer = startIndexer(sync, config.pollMs);
  nudge.current = (id) => indexer.nudge(id);
  return {
    config,
    db,
    auth,
    tokens,
    mailboxes,
    mail,
    sync,
    providers: loadProviders(),
    indexer,
  };
}
