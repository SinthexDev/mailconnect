import { notFound } from "./errors.js";
import type {
  Clock,
  CredentialRepository,
  CredentialVault,
  ImapPort,
  MailboxRepository,
  MessageIndexRepository,
} from "./ports.js";
import type { IndexStats, Mailbox, PublicUser } from "./types.js";

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
  ) {}

  async syncMailbox(mailboxId: string, options?: { quiet?: boolean }): Promise<void> {
    const mailbox = this.mailboxes.findById(mailboxId);
    if (!mailbox || !mailbox.imap) return;
    const blob = this.credentials.get(mailboxId, "imap");
    if (!blob) return;
    const now = this.clock.now();
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
    try {
      const password = this.vault.decrypt(blob);
      const cursors = this.messages.listCursors(mailboxId);
      const batch = await this.imap.pull({ ...mailbox.imap, password }, cursors, this.batchSize);
      const syncedAt = this.clock.now();
      for (const pull of batch.folders) this.messages.applyFolderPull(mailboxId, pull, syncedAt);
      const indexedCount = this.messages.count(mailboxId);
      const caughtUp = batch.caughtUp;
      this.mailboxes.setSyncState(mailboxId, {
        indexStatus: caughtUp ? "idle" : "syncing",
        indexedCount,
        lastSyncAt: syncedAt,
        lastError: null,
        errorStreak: 0,
        retryAt: null,
        updatedAt: syncedAt,
      });
    } catch (error) {
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
    }
  }

  async syncDue(skip: ReadonlySet<string> = new Set()): Promise<void> {
    const due = this.mailboxes.listIndexable(this.clock.now());
    for (const mailbox of due) {
      if (skip.has(mailbox.id)) continue;
      await this.syncMailbox(mailbox.id, { quiet: mailbox.indexStatus !== "syncing" });
    }
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

  stats(user: PublicUser): IndexStats {
    return this.messages.stats(user.id);
  }
}
