import { randomUUID } from "node:crypto";
import {
  AesGcmVault,
  SqliteDatabase,
  createSecretHasher,
  deliverWebhooks,
  imapAdapter,
  loadProviders,
  passwordHasher,
  smtpAdapter,
} from "@mailconnect/adapters";
import { AuditService, AuthService, MailService, MailboxService, SyncService, TokenService } from "@mailconnect/domain";
import type { AppConfig } from "./config.js";
import { startIndexer, type Indexer } from "./worker.js";

export type Container = {
  config: AppConfig;
  db: SqliteDatabase;
  auth: AuthService;
  tokens: TokenService;
  audit: AuditService;
  mailboxes: MailboxService;
  mail: MailService;
  sync: SyncService;
  providers: ReturnType<typeof loadProviders>;
  indexer: Indexer;
};

export function createContainer(config: AppConfig): Container {
  const db = new SqliteDatabase(config.databasePath, config.masterKey);
  const clock = { now: () => new Date().toISOString() };
  const ids = { newId: () => randomUUID() };
  const secrets = createSecretHasher(config.sessionSecret);
  const vault = new AesGcmVault(config.masterKey);
  const auth = new AuthService(db.users, db.invites, db.sessions, passwordHasher, secrets, ids, clock);
  const tokens = new TokenService(db.tokens, db.users, secrets, ids, clock);
  const audit = new AuditService(db.audit, ids, clock);
  const sync = new SyncService(db.mailboxes, db.credentials, db.messages, vault, imapAdapter, clock, config.syncBatch, {
    notify: async (event) => {
      const deliveries = await deliverWebhooks(event);
      for (const delivery of deliveries) {
        audit.record({
          userId: event.userId,
          source: "system",
          category: "flow",
          action: "webhook.deliver",
          status: delivery.status === "ok" ? "ok" : "error",
          mailboxId: event.mailboxId,
          mailboxEmail: event.email,
          resource: { url: delivery.url, method: delivery.method, httpStatus: delivery.httpStatus },
          output: {
            messageCount: delivery.messageCount,
            delivered: delivery.messages.map((message) => ({ id: message.id, folder: message.folder, uid: message.uid, from: message.from, subject: message.subject })),
          },
          error: delivery.error,
        });
      }
      return deliveries;
    },
  });
  const mail = new MailService(db.mailboxes, db.credentials, db.messages, vault, imapAdapter, smtpAdapter, clock);
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
    audit,
    mailboxes,
    mail,
    sync,
    providers: loadProviders(),
    indexer,
  };
}
