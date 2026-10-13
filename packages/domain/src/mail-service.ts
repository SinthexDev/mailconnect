import { AppError, notFound } from "./errors.js";
import type {
  CredentialRepository,
  CredentialVault,
  ImapPort,
  MailboxRepository,
  MessageIndexRepository,
  SmtpPort,
} from "./ports.js";
import type { FullMessage, IndexedMessage, OutboundMail, PublicUser, SearchQuery } from "./types.js";

export type SendInput = {
  mailboxId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
};

export class MailService {
  constructor(
    private readonly mailboxes: MailboxRepository,
    private readonly credentials: CredentialRepository,
    private readonly messages: MessageIndexRepository,
    private readonly vault: CredentialVault,
    private readonly imap: ImapPort,
    private readonly smtp: SmtpPort,
  ) {}

  search(query: SearchQuery): IndexedMessage[] {
    return this.messages.search(query);
  }

  folders(user: PublicUser, mailboxId: string) {
    const mailbox = this.owned(user, mailboxId);
    return this.messages.listFolders(mailbox.id, user.id);
  }

  getIndexed(user: PublicUser, messageId: string): IndexedMessage {
    const message = this.messages.findById(messageId, user.id);
    if (!message) throw notFound("Nachricht nicht im Index.");
    return message;
  }

  async read(user: PublicUser, messageId: string): Promise<FullMessage & { indexed: IndexedMessage }> {
    const indexed = this.getIndexed(user, messageId);
    const mailbox = this.owned(user, indexed.mailboxId);
    if (!mailbox.imap) throw new AppError("no_imap", "Dieses Konto hat kein IMAP.", 400);
    const blob = this.credentials.get(mailbox.id, "imap");
    if (!blob) throw new AppError("missing_secret", "IMAP-Zugangsdaten fehlen.", 500);
    const full = await this.imap.fetchMessage(
      { ...mailbox.imap, password: this.vault.decrypt(blob) },
      indexed.folder,
      indexed.uid,
    );
    return { ...full, indexed };
  }

  async readAttachment(user: PublicUser, messageId: string, attachmentId: string) {
    if (!/^\d+(\.\d+)*$/.test(attachmentId)) throw notFound("Diesen Anhang gibt es an der Nachricht nicht.");
    const indexed = this.getIndexed(user, messageId);
    const mailbox = this.owned(user, indexed.mailboxId);
    if (!mailbox.imap) throw new AppError("no_imap", "Dieses Konto hat kein IMAP.", 400);
    const blob = this.credentials.get(mailbox.id, "imap");
    if (!blob) throw new AppError("missing_secret", "IMAP-Zugangsdaten fehlen.", 500);
    return this.imap.fetchAttachment(
      { ...mailbox.imap, password: this.vault.decrypt(blob) },
      indexed.folder,
      indexed.uid,
      attachmentId,
    );
  }

  async send(user: PublicUser, input: SendInput): Promise<void> {
    const mailbox = this.owned(user, input.mailboxId);
    if (!mailbox.smtp) throw new AppError("no_smtp", "Dieses Konto hat kein SMTP.", 400);
    const blob = this.credentials.get(mailbox.id, "smtp");
    if (!blob) throw new AppError("missing_secret", "SMTP-Zugangsdaten fehlen.", 500);
    const message: OutboundMail = {
      from: mailbox.email,
      to: cleanAddresses(input.to),
      cc: cleanAddresses(input.cc ?? []),
      bcc: cleanAddresses(input.bcc ?? []),
      subject: input.subject.slice(0, 998),
      text: input.text,
      html: input.html,
    };
    if (message.to.length === 0) throw new AppError("missing_recipient", "Mindestens ein Empfänger ist nötig.", 400);
    if (message.to.length + message.cc.length + message.bcc.length > 50) {
      throw new AppError("too_many_recipients", "Zu viele Empfänger.", 400);
    }
    await this.smtp.send({ ...mailbox.smtp, password: this.vault.decrypt(blob) }, message);
  }

  private owned(user: PublicUser, mailboxId: string) {
    const mailbox = this.mailboxes.findById(mailboxId);
    if (!mailbox || mailbox.userId !== user.id) throw notFound("Mailkonto nicht gefunden.");
    return mailbox;
  }
}

function cleanAddresses(values: string[]): string[] {
  return values.map((value) => value.trim()).filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}
