import { AppError, notFound } from "./errors.js";
import type {
  CredentialRepository,
  CredentialVault,
  ImapPort,
  MailboxRepository,
  MessageIndexRepository,
  SmtpPort,
} from "./ports.js";
import type { Clock, IdGenerator } from "./ports.js";
import type {
  ChannelInput,
  ConnectionTestResult,
  Mailbox,
  PublicUser,
} from "./types.js";

export type MailboxDraft = {
  displayName: string;
  email: string;
  providerId: string | null;
  imap: ChannelInput | null;
  smtp: ChannelInput | null;
};

function cleanChannel(input: ChannelInput | null, requirePassword: boolean): ChannelInput | null {
  if (!input) return null;
  const host = input.host.trim();
  const username = input.username.trim();
  if (!host || !username) {
    throw new AppError("invalid_channel", "Host und Benutzername sind erforderlich.", 400);
  }
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new AppError("invalid_port", "Der Port ist ungültig.", 400);
  }
  if (requirePassword && !input.password) {
    throw new AppError("missing_password", "Für ein neues Protokoll braucht es ein Passwort.", 400);
  }
  return {
    host,
    port: input.port,
    secure: input.secure,
    username,
    password: input.password,
  };
}

function assertEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AppError("invalid_email", "Die E-Mail-Adresse ist ungültig.", 400);
  }
  return normalized;
}

export class MailboxService {
  constructor(
    private readonly mailboxes: MailboxRepository,
    private readonly credentials: CredentialRepository,
    private readonly messages: MessageIndexRepository,
    private readonly vault: CredentialVault,
    private readonly imap: ImapPort,
    private readonly smtp: SmtpPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly onSaved: (mailboxId: string) => void,
  ) {}

  list(user: PublicUser): Mailbox[] {
    return this.mailboxes.listByUser(user.id);
  }

  getOwned(user: PublicUser, id: string): Mailbox {
    const mailbox = this.mailboxes.findById(id);
    if (!mailbox || mailbox.userId !== user.id) throw notFound("Mailkonto nicht gefunden.");
    return mailbox;
  }

  async testDraft(draft: MailboxDraft, existing?: Mailbox): Promise<ConnectionTestResult> {
    const imap = cleanChannel(draft.imap, !existing?.imap);
    const smtp = cleanChannel(draft.smtp, !existing?.smtp);
    if (!imap && !smtp) {
      throw new AppError("empty_mailbox", "IMAP oder SMTP muss gesetzt sein.", 400);
    }
    const result: ConnectionTestResult = {};
    if (imap) {
      const password = imap.password || (existing ? this.readPassword(existing.id, "imap") : "");
      result.imap = await this.try("IMAP", () => this.imap.test({ ...imap, password }));
    }
    if (smtp) {
      const password = smtp.password || (existing ? this.readPassword(existing.id, "smtp") : "");
      result.smtp = await this.try("SMTP", () => this.smtp.test({ ...smtp, password }));
    }
    return result;
  }

  async create(user: PublicUser, draft: MailboxDraft): Promise<Mailbox> {
    const imap = cleanChannel(draft.imap, true);
    const smtp = cleanChannel(draft.smtp, true);
    if (!imap && !smtp) throw new AppError("empty_mailbox", "IMAP oder SMTP muss gesetzt sein.", 400);
    await this.assertConnections(imap, smtp);
    const now = this.clock.now();
    const mailbox: Mailbox = {
      id: this.ids.newId(),
      userId: user.id,
      displayName: this.displayName(draft.displayName, draft.email),
      email: assertEmail(draft.email),
      providerId: draft.providerId,
      imap: imap ? stripPassword(imap) : null,
      smtp: smtp ? stripPassword(smtp) : null,
      indexStatus: imap ? "syncing" : "disabled",
      indexedCount: 0,
      lastSyncAt: null,
      lastError: null,
      errorStreak: 0,
      retryAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.mailboxes.insert(mailbox);
    this.storeSecrets(mailbox.id, imap, smtp);
    if (imap) this.onSaved(mailbox.id);
    return mailbox;
  }

  async update(user: PublicUser, id: string, draft: MailboxDraft): Promise<Mailbox> {
    const existing = this.getOwned(user, id);
    const imap = cleanChannel(draft.imap, !existing.imap);
    const smtp = cleanChannel(draft.smtp, !existing.smtp);
    if (!imap && !smtp) throw new AppError("empty_mailbox", "IMAP oder SMTP muss gesetzt sein.", 400);
    const imapPassword = imap ? imap.password || this.readPassword(existing.id, "imap") : "";
    const smtpPassword = smtp ? smtp.password || this.readPassword(existing.id, "smtp") : "";
    if (imap && !imapPassword) throw new AppError("missing_password", "IMAP-Passwort fehlt.", 400);
    if (smtp && !smtpPassword) throw new AppError("missing_password", "SMTP-Passwort fehlt.", 400);
    if (imap) await this.imap.test({ ...imap, password: imapPassword });
    if (smtp) await this.smtp.test({ ...smtp, password: smtpPassword });

    const imapChanged = !sameChannel(existing.imap, imap);
    const mailbox: Mailbox = {
      ...existing,
      displayName: this.displayName(draft.displayName, draft.email),
      email: assertEmail(draft.email),
      providerId: draft.providerId,
      imap: imap ? stripPassword(imap) : null,
      smtp: smtp ? stripPassword(smtp) : null,
      indexStatus: imap ? "syncing" : "disabled",
      lastError: null,
      errorStreak: 0,
      retryAt: null,
      updatedAt: this.clock.now(),
    };
    this.mailboxes.update(mailbox);
    if (imap) this.credentials.upsert(id, "imap", this.vault.encrypt(imapPassword));
    else this.credentials.delete(id, "imap");
    if (smtp) this.credentials.upsert(id, "smtp", this.vault.encrypt(smtpPassword));
    else this.credentials.delete(id, "smtp");
    if (!imap) {
      this.messages.deleteMailboxData(id);
      mailbox.indexedCount = 0;
      this.mailboxes.update({ ...mailbox, indexedCount: 0 });
    } else if (imapChanged) {
      this.messages.deleteMailboxData(id);
      this.mailboxes.update({ ...mailbox, indexedCount: 0, lastSyncAt: null });
      this.onSaved(id);
    } else {
      this.onSaved(id);
    }
    return this.getOwned(user, id);
  }

  remove(user: PublicUser, id: string): void {
    this.getOwned(user, id);
    this.messages.deleteMailboxData(id);
    const ok = this.mailboxes.delete(id, user.id);
    if (!ok) throw notFound("Mailkonto nicht gefunden.");
  }

  private async assertConnections(imap: ChannelInput | null, smtp: ChannelInput | null): Promise<void> {
    if (imap) {
      if (!imap.password) throw new AppError("missing_password", "IMAP-Passwort fehlt.", 400);
      await this.imap.test({ ...imap, password: imap.password });
    }
    if (smtp) {
      if (!smtp.password) throw new AppError("missing_password", "SMTP-Passwort fehlt.", 400);
      await this.smtp.test({ ...smtp, password: smtp.password });
    }
  }

  private readPassword(mailboxId: string, kind: "imap" | "smtp"): string {
    const blob = this.credentials.get(mailboxId, kind);
    if (!blob) return "";
    return this.vault.decrypt(blob);
  }

  private storeSecrets(mailboxId: string, imap: ChannelInput | null, smtp: ChannelInput | null): void {
    if (imap?.password) this.credentials.upsert(mailboxId, "imap", this.vault.encrypt(imap.password));
    if (smtp?.password) this.credentials.upsert(mailboxId, "smtp", this.vault.encrypt(smtp.password));
  }

  private displayName(name: string, email: string): string {
    const trimmed = name.trim();
    if (!trimmed) return assertEmail(email);
    if (trimmed.length > 120) throw new AppError("invalid_name", "Der Name ist zu lang.", 400);
    return trimmed;
  }

  private async try(label: string, fn: () => Promise<void>): Promise<{ ok: boolean; error?: string }> {
    try {
      await fn();
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : `${label} fehlgeschlagen.`;
      return { ok: false, error: message };
    }
  }
}

function stripPassword(input: ChannelInput) {
  return {
    host: input.host,
    port: input.port,
    secure: input.secure,
    username: input.username,
  };
}

function sameChannel(
  left: { host: string; port: number; secure: boolean; username: string } | null,
  right: ChannelInput | null,
): boolean {
  if (!left || !right) return false;
  return left.host === right.host && left.port === right.port && left.secure === right.secure && left.username === right.username;
}
