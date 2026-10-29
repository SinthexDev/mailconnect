import { notFound } from "./errors.js";
import type {
  Clock,
  CredentialRepository,
  CredentialVault,
  ImapPort,
  MailboxRepository,
  MessageIndexRepository,
  WebhookMessage,
  WebhookPort,
} from "./ports.js";
import type { IndexProgress, IndexStats, Mailbox, PublicUser } from "./types.js";
import { isFreshArrival } from "./webhooks.js";

export type SyncRequest = {
  mailbox: Mailbox;
  started: boolean;
};

export function planSync(mailboxes: Mailbox[], mailboxId?: string): { mailbox: Mailbox; start: boolean }[] {
  if (mailboxId) {
    const mailbox = mailboxes.find((item) => item.id === mailboxId);
    return mailbox ? [{ mailbox, start: Boolean(mailbox.imap) }] : [];
  }
  return mailboxes.map((mailbox) => ({
    mailbox,
    start: Boolean(mailbox.imap) && mailbox.indexStatus !== "paused" && mailbox.indexStatus !== "disabled",
  }));
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "Synchronisation fehlgeschlagen.";
}

export class SyncService {
  constructor(
    private readonly mailboxes: MailboxRepository,
    private readonly credentials: CredentialRepository,
    private readonly messages: MessageIndexRepository,
    private readonly vault: CredentialVault,
    private readonly imap: ImapPort,
    private readonly clock: Clock,
    private readonly batchSize: number,
    private readonly webhooks: WebhookPort = { async notify() {} },
  ) {}

  async syncMailbox(mailboxId: string, options?: { quiet?: boolean }): Promise<void> {
    const mailbox = this.mailboxes.findById(mailboxId);
    if (!mailbox || !mailbox.imap) return;
    const blob = this.credentials.get(mailboxId, "imap");
    if (!blob) return;
    const now = this.clock.now();
    if (mailbox.indexStatus === "paused") return;
    if (!options?.quiet) {
      this.mailboxes.setSyncState(mailboxId, {
        indexStatus: "syncing",
        indexedCount: mailbox.indexedCount,
        lastSyncAt: mailbox.lastSyncAt,
        lastError: null,
        errorStreak: mailbox.errorStreak,
        retryAt: null,
        updatedAt: now,
      });
    }
    const arrived: WebhookMessage[] = [];
    const freshFolders = new Set<string>();
    let arrivedCount = 0;
    try {
      const password = this.vault.decrypt(blob);
      const deadline = Date.now() + 4 * 60_000;
      let caughtUp = false;
      let guard = 0;
      while (!caughtUp && guard < 60 && Date.now() < deadline) {
        if (this.isPaused(mailboxId)) return;
        guard += 1;
        const cursors = this.messages.listCursors(mailboxId);
        const batch = await this.imap.pull({ ...mailbox.imap, password }, cursors, this.batchSize, (pull) => {
          if (this.isPaused(mailboxId)) throw new Error("paused");
          const ids = this.messages.applyFolderPull(mailboxId, pull, this.clock.now());
          const cursor = cursors.find((item) => item.folder === pull.folder);
          const fresh = !pull.reset && pull.messages.length > 0 && (freshFolders.has(pull.folder) || isFreshArrival(cursor, pull));
          if (fresh) {
            freshFolders.add(pull.folder);
            pull.messages.forEach((message, index) => {
              const id = ids[index];
              if (!id) return;
              arrivedCount += 1;
              if (arrived.length < 50) {
                arrived.push({
                  id,
                  folder: pull.folder,
                  uid: message.uid,
                  from: message.from,
                  to: message.to,
                  subject: message.subject,
                  date: message.date,
                  snippet: message.snippet,
                });
              }
            });
          }
          const current = this.mailboxes.findById(mailboxId);
          if (current?.indexStatus === "syncing" || !pull.caughtUp || pull.messages.length > 0) this.publish(mailboxId);
        });
        if (this.isPaused(mailboxId)) return;
        caughtUp = batch.caughtUp;
        const syncedAt = this.clock.now();
        const indexedCount = this.messages.count(mailboxId);
        this.mailboxes.setSyncState(mailboxId, {
          indexStatus: caughtUp ? "idle" : "syncing",
          indexedCount,
          lastSyncAt: syncedAt,
          lastError: null,
          errorStreak: 0,
          retryAt: null,
          updatedAt: syncedAt,
        });
        if (!caughtUp && batch.folders.every((pull) => pull.messages.length === 0)) break;
      }
    } catch (error) {
      if (this.isPaused(mailboxId) || (error instanceof Error && error.message === "paused")) return;
      const streak = mailbox.errorStreak + 1;
      const delayMs = Math.min(30 * 60_000, 30_000 * 2 ** Math.min(streak, 6));
      const failedAt = this.clock.now();
      this.mailboxes.setSyncState(mailboxId, {
        indexStatus: "error",
        indexedCount: this.messages.count(mailboxId),
        lastSyncAt: mailbox.lastSyncAt,
        lastError: errorText(error),
        errorStreak: streak,
        retryAt: new Date(Date.parse(failedAt) + delayMs).toISOString(),
        updatedAt: failedAt,
      });
    } finally {
      this.flushArrivals(mailbox, arrived, arrivedCount);
    }
  }

  private flushArrivals(mailbox: Mailbox, messages: WebhookMessage[], count: number): void {
    const current = this.mailboxes.findById(mailbox.id) ?? mailbox;
    if (count <= 0 || current.webhooks.length === 0) return;
    void this.webhooks.notify({
      userId: current.userId,
      mailboxId: current.id,
      displayName: current.displayName,
      email: current.email,
      hooks: current.webhooks,
      count,
      messages,
    }).catch((error: unknown) => {
      console.error("Webhook", error instanceof Error ? error.message : error);
    });
  }

  async syncDue(skip: ReadonlySet<string> = new Set()): Promise<void> {
    const due = this.mailboxes.listIndexable(this.clock.now());
    for (const mailbox of due) {
      if (skip.has(mailbox.id)) continue;
      await this.syncMailbox(mailbox.id, { quiet: mailbox.indexStatus !== "syncing" });
    }
  }

  request(user: PublicUser, mailboxId?: string): SyncRequest[] {
    const owned = this.mailboxes.listByUser(user.id);
    const plan = planSync(owned, mailboxId);
    if (mailboxId && plan.length === 0) throw notFound("Mailkonto nicht gefunden.");
    return plan.map((item) => {
      if (!item.start) return { mailbox: item.mailbox, started: false };
      return { mailbox: this.enqueue(user, item.mailbox.id), started: true };
    });
  }

  enqueue(user: PublicUser, mailboxId: string): Mailbox {
    const mailbox = this.mailboxes.findById(mailboxId);
    if (!mailbox || mailbox.userId !== user.id) throw notFound("Mailkonto nicht gefunden.");
    if (!mailbox.imap) return mailbox;
    const updatedAt = this.clock.now();
    this.mailboxes.setSyncState(mailboxId, {
      indexStatus: "syncing",
      indexedCount: mailbox.indexedCount,
      lastSyncAt: mailbox.lastSyncAt,
      lastError: null,
      errorStreak: 0,
      retryAt: null,
      updatedAt,
    });
    return { ...mailbox, indexStatus: "syncing", lastError: null, errorStreak: 0, retryAt: null, updatedAt };
  }

  pause(user: PublicUser, mailboxId: string): Mailbox {
    const mailbox = this.mailboxes.findById(mailboxId);
    if (!mailbox || mailbox.userId !== user.id) throw notFound("Mailkonto nicht gefunden.");
    if (mailbox.indexStatus !== "syncing") return mailbox;
    const updatedAt = this.clock.now();
    const indexedCount = this.messages.count(mailboxId);
    this.mailboxes.setSyncState(mailboxId, {
      indexStatus: "paused",
      indexedCount,
      lastSyncAt: mailbox.lastSyncAt,
      lastError: null,
      errorStreak: 0,
      retryAt: null,
      updatedAt,
    });
    return { ...mailbox, indexStatus: "paused", indexedCount, lastError: null, errorStreak: 0, retryAt: null, updatedAt };
  }

  progress(mailboxId: string): IndexProgress {
    return this.messages.progress(mailboxId);
  }

  private isPaused(mailboxId: string): boolean {
    return this.mailboxes.findById(mailboxId)?.indexStatus === "paused";
  }

  private publish(mailboxId: string): void {
    const current = this.mailboxes.findById(mailboxId);
    if (!current || current.indexStatus === "paused" || current.indexStatus === "disabled") return;
    const updatedAt = this.clock.now();
    this.mailboxes.setSyncState(mailboxId, {
      indexStatus: "syncing",
      indexedCount: this.messages.count(mailboxId),
      lastSyncAt: updatedAt,
      lastError: null,
      errorStreak: 0,
      retryAt: null,
      updatedAt,
    });
  }

  stats(user: PublicUser): IndexStats {
    return this.messages.stats(user.id);
  }
}
