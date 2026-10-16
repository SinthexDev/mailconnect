import { AppError, notFound } from "./errors.js";
import { assertFolderPath, assertNotInbox, buildPlainMessage, filterDirectChildren, normalizeFlag, normalizeFlags } from "./imap-rules.js";
import type {
  Clock,
  CredentialRepository,
  CredentialVault,
  ImapPort,
  MailboxRepository,
  MessageIndexRepository,
  SmtpPort,
} from "./ports.js";
import type { FlagMode, FullMessage, ImapSearchCriteria, IndexedMessage, OutboundMail, PublicUser, SearchQuery, StoredAppend } from "./types.js";

export type SendInput = {
  mailboxId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
};

export type MessageTarget = {
  messageIds?: string[];
  mailboxId?: string;
  folder?: string;
  uids?: number[];
};

export type AppendInput = {
  mailboxId: string;
  folder: string;
  flags?: string[];
  raw?: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  text?: string;
};

type Target = {
  id: string | null;
  uid: number;
  subject: string;
  flags: string[];
};

const SEARCH_LIMIT = 200;

export class MailService {
  constructor(
    private readonly mailboxes: MailboxRepository,
    private readonly credentials: CredentialRepository,
    private readonly messages: MessageIndexRepository,
    private readonly vault: CredentialVault,
    private readonly imap: ImapPort,
    private readonly smtp: SmtpPort,
    private readonly clock: Clock,
  ) {}

  search(query: SearchQuery): IndexedMessage[] {
    return this.messages.search(query);
  }

  folders(user: PublicUser, mailboxId: string, parent?: string) {
    const mailbox = this.owned(user, mailboxId);
    const all = this.messages.listFolders(mailbox.id, user.id);
    return filterDirectChildren(all, parent, (item) => item.folder, all.map((item) => item.folder));
  }

  async listRemoteFolders(user: PublicUser, mailboxId: string, parent?: string) {
    const { settings } = this.imapOf(user, mailboxId);
    const folders = await this.imap.listRemoteFolders(settings);
    if (parent === undefined) return folders;
    return folders.filter((folder) => folder.parentPath === parent);
  }

  async folderStatus(user: PublicUser, mailboxId: string, folder: string) {
    const path = assertFolderPath(folder);
    const { settings } = this.imapOf(user, mailboxId);
    return this.imap.folderStatus(settings, path);
  }

  async createFolder(user: PublicUser, mailboxId: string, folder: string) {
    const path = assertFolderPath(folder);
    const { settings } = this.imapOf(user, mailboxId);
    const created = await this.imap.createFolder(settings, path);
    this.messages.ensureFolder(mailboxId, created.path, this.clock.now());
    return created;
  }

  async renameFolder(user: PublicUser, mailboxId: string, folder: string, newFolder: string) {
    const path = assertFolderPath(folder);
    const next = assertFolderPath(newFolder);
    assertNotInbox(path, "umbenennen");
    if (path === next) throw new AppError("same_folder", "Der neue Name ist der bisherige.", 400);
    const { settings } = this.imapOf(user, mailboxId);
    const renamed = await this.imap.renameFolder(settings, path, next);
    this.messages.rewriteFolders(mailboxId, renamed.path, renamed.newPath, renamed.delimiter);
    return { path: renamed.path, newPath: renamed.newPath };
  }

  async deleteFolder(user: PublicUser, mailboxId: string, folder: string) {
    const path = assertFolderPath(folder);
    assertNotInbox(path, "löschen");
    const { settings } = this.imapOf(user, mailboxId);
    await this.imap.deleteFolder(settings, path);
    const total = this.messages.removeFolder(mailboxId, path);
    this.mailboxes.setIndexedCount(mailboxId, total, this.clock.now());
    return { path, indexedCount: total };
  }

  async setFolderSubscription(user: PublicUser, mailboxId: string, folder: string, subscribed: boolean) {
    const path = assertFolderPath(folder);
    const { settings } = this.imapOf(user, mailboxId);
    await this.imap.setSubscription(settings, path, subscribed);
    return { path, subscribed };
  }

  async deleteMessages(user: PublicUser, target: MessageTarget) {
    const located = this.locate(user, target);
    const { settings } = this.imapOf(user, located.mailboxId);
    await this.imap.deleteMessages(settings, located.folder, located.targets.map((item) => item.uid));
    const indexedCount = this.messages.applyDeletion(located.mailboxId, located.folder, located.targets.map((item) => item.uid));
    this.mailboxes.setIndexedCount(located.mailboxId, indexedCount, this.clock.now());
    return {
      ok: true as const,
      mailboxId: located.mailboxId,
      folder: located.folder,
      deleted: located.targets.map((item) => ({ id: item.id, uid: item.uid, subject: item.subject })),
    };
  }

  async moveMessages(user: PublicUser, target: MessageTarget, destination: string) {
    return this.transfer(user, target, destination, "move");
  }

  async copyMessages(user: PublicUser, target: MessageTarget, destination: string) {
    return this.transfer(user, target, destination, "copy");
  }

  async setFlags(user: PublicUser, target: MessageTarget, mode: FlagMode, flags: string[]) {
    const next = normalizeFlags(flags);
    if (mode !== "set" && next.length === 0) throw new AppError("bad_flag", "Mindestens eine Markierung ist nötig.", 400);
    const located = this.locate(user, target);
    const { settings } = this.imapOf(user, located.mailboxId);
    const stored = await this.imap.storeFlags(settings, located.folder, located.targets.map((item) => item.uid), mode, next);
    this.messages.applyFlags(located.mailboxId, located.folder, stored);
    const known = new Map(located.targets.map((item) => [item.uid, item.id]));
    return {
      ok: true as const,
      mailboxId: located.mailboxId,
      folder: located.folder,
      messages: stored.map((item) => ({ id: known.get(item.uid) ?? null, uid: item.uid, flags: item.flags })),
    };
  }

  async appendMessage(user: PublicUser, input: AppendInput) {
    const folder = assertFolderPath(input.folder);
    const flags = normalizeFlags(input.flags ?? []);
    const { mailbox, settings } = this.imapOf(user, input.mailboxId);
    const raw = input.raw?.trim();
    let rfc822 = raw ?? "";
    let stored: Omit<StoredAppend, "folder" | "uid"> | null = null;
    if (raw) {
      if (raw.length > 1_000_000) throw new AppError("message_too_large", "Die Nachricht ist größer als 1 MB.", 400);
    } else {
      if (input.text === undefined) throw new AppError("missing_body", "Text oder raw ist nötig.", 400);
      const to = cleanAddresses(input.to ?? []);
      const cc = cleanAddresses(input.cc ?? []);
      if ((input.to?.length ?? 0) > 0 && to.length === 0) throw new AppError("missing_recipient", "Mindestens ein Empfänger ist nötig.", 400);
      const text = input.text;
      const subject = (input.subject ?? "").slice(0, 998);
      rfc822 = buildPlainMessage({ from: mailbox.email, to, cc, subject, text, date: new Date(this.clock.now()) });
      stored = {
        from: mailbox.email,
        to: to.join(", "),
        cc: cc.join(", "),
        subject,
        date: this.clock.now(),
        flags,
        snippet: text.replace(/\s+/g, " ").trim().slice(0, 500),
      };
    }
    const appended = await this.imap.appendMessage(settings, folder, rfc822, flags);
    if (stored && appended.uid !== null) {
      const indexedCount = this.messages.applyAppend(input.mailboxId, { ...stored, folder, uid: appended.uid }, this.clock.now());
      this.mailboxes.setIndexedCount(input.mailboxId, indexedCount, this.clock.now());
    }
    return { ok: true as const, folder, uid: appended.uid, indexed: Boolean(stored && appended.uid !== null) };
  }

  async searchImap(user: PublicUser, mailboxId: string, folder: string, criteria: ImapSearchCriteria) {
    const path = assertFolderPath(folder);
    const query = compactCriteria(criteria);
    if (!hasCriterion(query)) throw new AppError("empty_search", "Die IMAP-Suche braucht mindestens ein Kriterium.", 400);
    const { settings } = this.imapOf(user, mailboxId);
    const uids = await this.imap.searchUids(settings, path, query);
    const limited = uids.slice(0, SEARCH_LIMIT);
    const indexed = this.messages.findInFolder(mailboxId, path, limited);
    const byUid = new Map(indexed.map((message) => [message.uid, message]));
    return {
      folder: path,
      uids: limited,
      truncated: uids.length > SEARCH_LIMIT,
      messages: limited.flatMap((uid) => {
        const message = byUid.get(uid);
        return message ? [{ id: message.id, uid, subject: message.subject, from: message.from, date: message.date, flags: message.flags }] : [];
      }),
    };
  }

  getIndexed(user: PublicUser, messageId: string): IndexedMessage {
    const message = this.messages.findById(messageId, user.id);
    if (!message) throw notFound("Nachricht nicht im Index.");
    return message;
  }

  async read(user: PublicUser, messageId: string): Promise<FullMessage & { indexed: IndexedMessage }> {
    const indexed = this.getIndexed(user, messageId);
    const { settings } = this.imapOf(user, indexed.mailboxId);
    const full = await this.imap.fetchMessage(settings, indexed.folder, indexed.uid);
    return { ...full, indexed };
  }

  async readAttachment(user: PublicUser, messageId: string, attachmentId: string) {
    if (!/^\d+(\.\d+)*$/.test(attachmentId)) throw notFound("Diesen Anhang gibt es an der Nachricht nicht.");
    const indexed = this.getIndexed(user, messageId);
    const { settings } = this.imapOf(user, indexed.mailboxId);
    return this.imap.fetchAttachment(settings, indexed.folder, indexed.uid, attachmentId);
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

  private async transfer(user: PublicUser, target: MessageTarget, destination: string, kind: "move" | "copy") {
    const path = assertFolderPath(destination);
    const located = this.locate(user, target);
    if (kind === "move" && path === located.folder) throw new AppError("same_folder", "Der Zielordner ist der aktuelle Ordner.", 400);
    const { settings } = this.imapOf(user, located.mailboxId);
    const uids = located.targets.map((item) => item.uid);
    const moved = kind === "move"
      ? await this.imap.moveMessages(settings, located.folder, uids, path)
      : await this.imap.copyMessages(settings, located.folder, uids, path);
    const at = this.clock.now();
    const indexedCount = kind === "move"
      ? this.messages.applyMove(located.mailboxId, located.folder, path, moved, at)
      : this.messages.applyCopy(located.mailboxId, located.folder, path, moved, at);
    this.mailboxes.setIndexedCount(located.mailboxId, indexedCount, at);
    const byUid = new Map(moved.map((item) => [item.uid, item.destinationUid]));
    const rows = located.targets.map((item) => ({
      id: item.id,
      uid: item.uid,
      destinationUid: byUid.get(item.uid) ?? null,
      subject: item.subject,
    }));
    return kind === "move"
      ? { ok: true as const, mailboxId: located.mailboxId, folder: located.folder, destination: path, moved: rows }
      : { ok: true as const, mailboxId: located.mailboxId, folder: located.folder, destination: path, copied: rows };
  }

  private locate(user: PublicUser, target: MessageTarget): { mailboxId: string; folder: string; targets: Target[] } {
    const ids = unique(target.messageIds ?? []);
    const uids = uniqueNumbers(target.uids ?? []);
    if ((ids.length > 0) === (uids.length > 0) || (ids.length === 0 && uids.length === 0)) {
      throw new AppError("bad_target", "Entweder messageIds oder mailboxId, folder und uids angeben.", 400);
    }
    if (ids.length > 100 || uids.length > 100) throw new AppError("too_many_messages", "Höchstens 100 Nachrichten auf einmal.", 400);
    if (ids.length > 0) {
      const messages = ids.map((id) => this.getIndexed(user, id));
      const mailboxId = messages[0]?.mailboxId;
      const folder = messages[0]?.folder;
      if (!mailboxId || !folder || messages.some((message) => message.mailboxId !== mailboxId || message.folder !== folder)) {
        throw new AppError("mixed_folder", "Die Nachrichten müssen im selben Ordner desselben Kontos liegen.", 400);
      }
      this.owned(user, mailboxId);
      return { mailboxId, folder, targets: messages.map((message) => ({ id: message.id, uid: message.uid, subject: message.subject, flags: message.flags })) };
    }
    if (!target.mailboxId || !target.folder) throw new AppError("bad_target", "mailboxId und folder gehören zu den uids.", 400);
    const folder = assertFolderPath(target.folder);
    this.owned(user, target.mailboxId);
    const indexed = this.messages.findInFolder(target.mailboxId, folder, uids);
    const byUid = new Map(indexed.map((message) => [message.uid, message]));
    return {
      mailboxId: target.mailboxId,
      folder,
      targets: uids.map((uid) => {
        const message = byUid.get(uid);
        return { id: message?.id ?? null, uid, subject: message?.subject ?? "", flags: message?.flags ?? [] };
      }),
    };
  }

  private imapOf(user: PublicUser, mailboxId: string) {
    const mailbox = this.owned(user, mailboxId);
    if (!mailbox.imap) throw new AppError("no_imap", "Dieses Konto hat kein IMAP.", 400);
    const blob = this.credentials.get(mailbox.id, "imap");
    if (!blob) throw new AppError("missing_secret", "IMAP-Zugangsdaten fehlen.", 500);
    return { mailbox, settings: { ...mailbox.imap, password: this.vault.decrypt(blob) } };
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

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

function compactCriteria(criteria: ImapSearchCriteria): ImapSearchCriteria {
  const text = (value: string | undefined) => value?.trim().slice(0, 200) || undefined;
  const query: ImapSearchCriteria = {
    seen: criteria.seen,
    flagged: criteria.flagged,
    answered: criteria.answered,
    draft: criteria.draft,
    deleted: criteria.deleted,
    from: text(criteria.from),
    to: text(criteria.to),
    cc: text(criteria.cc),
    subject: text(criteria.subject),
    body: text(criteria.body),
    text: text(criteria.text),
    since: text(criteria.since),
    before: text(criteria.before),
  };
  if (criteria.keyword) {
    const flag = normalizeFlag(criteria.keyword);
    if (flag === "\\Seen") query.seen = true;
    else if (flag === "\\Flagged") query.flagged = true;
    else if (flag === "\\Answered") query.answered = true;
    else if (flag === "\\Draft") query.draft = true;
    else if (flag === "\\Deleted") query.deleted = true;
    else query.keyword = flag;
  }
  return query;
}

function hasCriterion(criteria: ImapSearchCriteria): boolean {
  return Object.values(criteria).some((value) => value !== undefined);
}
