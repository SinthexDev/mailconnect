import { AppError, notFound } from "./errors.js";
import { assertFolderPath } from "./imap-rules.js";
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
  MailboxWebhook,
  PublicUser,
} from "./types.js";
import { removeSignature, upsertSignature } from "./signatures.js";
import { parseExcludedFolders, parseWebhookList } from "./webhooks.js";

export type MailboxDraft = {
  displayName: string;
  description: string;
  instructions: string;
  webhooks: MailboxWebhook[];
  email: string;
  providerId: string | null;
  imap: ChannelInput | null;
  smtp: ChannelInput | null;
  sentFolder: string;
  serverStoresSent: boolean;
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
    const smtp = cleanChannel(draft.smtp, false);
    if (!imap && !smtp) {
      throw new AppError("empty_mailbox", "IMAP oder SMTP muss gesetzt sein.", 400);
    }
    const passwords = this.passwordsFor(imap, smtp, existing);
    const result: ConnectionTestResult = {};
    if (imap) result.imap = await this.try("IMAP", () => this.imap.test({ ...imap, password: passwords.imap }));
    if (smtp) result.smtp = await this.try("SMTP", () => this.smtp.test({ ...smtp, password: passwords.smtp }));
    return result;
  }

  async create(user: PublicUser, draft: MailboxDraft): Promise<Mailbox> {
    const imap = cleanChannel(draft.imap, true);
    const smtp = cleanChannel(draft.smtp, false);
    if (!imap && !smtp) throw new AppError("empty_mailbox", "IMAP oder SMTP muss gesetzt sein.", 400);
    const passwords = this.passwordsFor(imap, smtp);
    await this.assertConnections(imap, smtp, passwords);
    const now = this.clock.now();
    const mailbox: Mailbox = {
      id: this.ids.newId(),
      userId: user.id,
      displayName: this.displayName(draft.displayName, draft.email),
      description: this.description(draft.description),
      instructions: this.instructions(draft.instructions),
      webhooks: this.webhooks(draft.webhooks),
      webhookExcludedFolders: [],
      signatures: [],
      email: assertEmail(draft.email),
      providerId: draft.providerId,
      imap: imap ? stripPassword(imap) : null,
      smtp: smtp ? stripPassword(smtp) : null,
      sentFolder: this.sentFolderName(draft.sentFolder),
      serverStoresSent: draft.serverStoresSent,
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
    this.storeSecrets(mailbox.id, imap, smtp, passwords);
    if (imap) this.onSaved(mailbox.id);
    return mailbox;
  }

  async update(user: PublicUser, id: string, draft: MailboxDraft): Promise<Mailbox> {
    const existing = this.getOwned(user, id);
    const imap = cleanChannel(draft.imap, !existing.imap);
    const smtp = cleanChannel(draft.smtp, false);
    if (!imap && !smtp) throw new AppError("empty_mailbox", "IMAP oder SMTP muss gesetzt sein.", 400);
    const passwords = this.passwordsFor(imap, smtp, existing);
    await this.assertConnections(imap, smtp, passwords);

    const imapChanged = !sameChannel(existing.imap, imap);
    const mailbox: Mailbox = {
      ...existing,
      displayName: this.displayName(draft.displayName, draft.email),
      description: this.description(draft.description),
      instructions: this.instructions(draft.instructions),
      webhooks: this.webhooks(draft.webhooks),
      email: assertEmail(draft.email),
      providerId: draft.providerId,
      imap: imap ? stripPassword(imap) : null,
      smtp: smtp ? stripPassword(smtp) : null,
      sentFolder: this.sentFolderName(draft.sentFolder),
      serverStoresSent: draft.serverStoresSent,
      indexStatus: imap ? "syncing" : "disabled",
      lastError: null,
      errorStreak: 0,
      retryAt: null,
      updatedAt: this.clock.now(),
    };
    this.mailboxes.update(mailbox);
    if (imap) this.credentials.upsert(id, "imap", this.vault.encrypt(passwords.imap));
    else this.credentials.delete(id, "imap");
    if (smtp) this.credentials.upsert(id, "smtp", this.vault.encrypt(passwords.smtp));
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

  setWebhooks(user: PublicUser, id: string, values: unknown[]): Mailbox {
    const existing = this.getOwned(user, id);
    const specified = new Set(values.flatMap((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || !("excludedFolders" in raw)) return [];
      const record = raw as { url?: unknown };
      const url = typeof record.url === "string" ? record.url.trim() : "";
      if (!url) return [];
      try { return [new URL(url).href]; } catch { return [url]; }
    }));
    const webhooks = parseWebhookList(values).map((hook) => {
      if (specified.has(hook.url)) return hook;
      const previous = existing.webhooks.find((item) => item.url === hook.url);
      return previous ? { ...hook, excludedFolders: previous.excludedFolders } : hook;
    });
    const updatedAt = this.clock.now();
    if (!this.mailboxes.setWebhooks(id, user.id, webhooks, updatedAt)) throw notFound("Mailkonto nicht gefunden.");
    return this.getOwned(user, id);
  }

  setWebhookFolders(user: PublicUser, id: string, url: string, values: unknown[]): Mailbox {
    const existing = this.getOwned(user, id);
    const folders = parseExcludedFolders(values);
    const target = url.trim();
    if (!existing.webhooks.some((hook) => hook.url === target)) {
      throw new AppError("invalid_webhook", "Diesen Webhook gibt es an dem Postfach nicht.", 400);
    }
    const webhooks = existing.webhooks.map((hook) => hook.url === target ? { ...hook, excludedFolders: folders } : hook);
    const updatedAt = this.clock.now();
    if (!this.mailboxes.setWebhooks(id, user.id, webhooks, updatedAt)) throw notFound("Mailkonto nicht gefunden.");
    return this.getOwned(user, id);
  }

  saveSignature(
    user: PublicUser,
    id: string,
    input: { id?: string; title: string; kind: string; body: string; instructions: string; isDefault?: boolean },
  ): Mailbox {
    const existing = this.getOwned(user, id);
    if (input.id && !existing.signatures.some((item) => item.id === input.id)) throw notFound("Signatur nicht gefunden.");
    const signatures = upsertSignature(existing.signatures, {
      id: input.id,
      title: input.title,
      kind: input.kind,
      body: input.body,
      instructions: input.instructions,
      isDefault: input.isDefault === true,
    }, input.id?.trim() ? input.id : this.ids.newId());
    const updatedAt = this.clock.now();
    if (!this.mailboxes.setSignatures(id, user.id, signatures, updatedAt)) throw notFound("Mailkonto nicht gefunden.");
    return this.getOwned(user, id);
  }

  deleteSignature(user: PublicUser, id: string, signatureId: string): Mailbox {
    const existing = this.getOwned(user, id);
    if (!existing.signatures.some((item) => item.id === signatureId)) throw notFound("Signatur nicht gefunden.");
    const signatures = removeSignature(existing.signatures, signatureId);
    const updatedAt = this.clock.now();
    if (!this.mailboxes.setSignatures(id, user.id, signatures, updatedAt)) throw notFound("Mailkonto nicht gefunden.");
    return this.getOwned(user, id);
  }

  remove(user: PublicUser, id: string): void {
    this.getOwned(user, id);
    this.messages.deleteMailboxData(id);
    const ok = this.mailboxes.delete(id, user.id);
    if (!ok) throw notFound("Mailkonto nicht gefunden.");
  }

  private passwordsFor(imap: ChannelInput | null, smtp: ChannelInput | null, existing?: Mailbox): { imap: string; smtp: string } {
    const typedImap = imap?.password ?? "";
    const typedSmtp = smtp?.password ?? "";
    const storedImap = existing && imap ? this.readPassword(existing.id, "imap") : "";
    const storedSmtp = existing?.smtp && smtp ? this.readPassword(existing.id, "smtp") : "";
    const imapPassword = typedImap || storedImap;
    const smtpPassword = typedSmtp || typedImap || storedSmtp || (imap ? storedImap : "");
    return { imap: imapPassword, smtp: smtpPassword };
  }

  private async assertConnections(
    imap: ChannelInput | null,
    smtp: ChannelInput | null,
    passwords: { imap: string; smtp: string },
  ): Promise<void> {
    if (imap) {
      if (!passwords.imap) throw new AppError("missing_password", "IMAP-Passwort fehlt.", 400);
      await this.imap.test({ ...imap, password: passwords.imap });
    }
    if (smtp) {
      if (!passwords.smtp) throw new AppError("missing_password", "SMTP-Passwort fehlt. Leer lassen übernimmt das IMAP-Passwort.", 400);
      await this.smtp.test({ ...smtp, password: passwords.smtp });
    }
  }

  private readPassword(mailboxId: string, kind: "imap" | "smtp"): string {
    const blob = this.credentials.get(mailboxId, kind);
    if (!blob) return "";
    return this.vault.decrypt(blob);
  }

  private storeSecrets(
    mailboxId: string,
    imap: ChannelInput | null,
    smtp: ChannelInput | null,
    passwords: { imap: string; smtp: string },
  ): void {
    if (imap && passwords.imap) this.credentials.upsert(mailboxId, "imap", this.vault.encrypt(passwords.imap));
    if (smtp && passwords.smtp) this.credentials.upsert(mailboxId, "smtp", this.vault.encrypt(passwords.smtp));
  }

  private description(value: string): string {
    return this.boundedText(value, 500, "invalid_description", "Die Beschreibung ist zu lang.");
  }

  private sentFolderName(value: string): string {
    const folder = value.trim();
    if (!folder) return "";
    return assertFolderPath(folder);
  }

  private instructions(value: string): string {
    return this.boundedText(value, 2000, "invalid_instructions", "Die Handlungsanweisungen sind zu lang.");
  }

  private webhooks(values: unknown[]): MailboxWebhook[] {
    return parseWebhookList(values);
  }

  private boundedText(value: string, max: number, code: string, message: string): string {
    const trimmed = value.trim();
    if (trimmed.length > max) throw new AppError(code, message, 400);
    return trimmed;
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
