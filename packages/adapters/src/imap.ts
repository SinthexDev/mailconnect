import { createHash } from "node:crypto";
import { ImapFlow, type FetchMessageObject, type MessageStructureObject } from "imapflow";
import type { SearchObject } from "imapflow";
import {
  AppError,
  type AttachmentFile,
  type FlagMode,
  type FolderCursor,
  type FolderPull,
  type FullMessage,
  type ImapFolderInfo,
  type ImapFolderStatus,
  type ImapPort,
  type ImapSearchCriteria,
  type ImapSettings,
  type PullBatch,
  type RemoteMessage,
  type StoredFlag,
  type UidRelocation,
} from "@mailconnect/domain";
import { listAttachments, MAX_ATTACHMENT_BYTES } from "./attachments.js";
import { messageText, stripHtml } from "./html-text.js";
import { connectionError, missingMailbox } from "./mail-error.js";
import { uidsFromSearch } from "./uid-set.js";

const CONNECT_MS = 20_000;
const SNIPPET_BYTES = 4_000;

function clientFor(settings: ImapSettings): { client: ImapFlow; broken: Promise<never> } {
  const client = new ImapFlow({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.username, pass: settings.password },
    logger: false,
    connectionTimeout: CONNECT_MS,
    greetingTimeout: CONNECT_MS,
    socketTimeout: 60_000,
    tls: { minVersion: "TLSv1.2" },
  });
  const broken = new Promise<never>((_, reject) => {
    client.on("error", (error: unknown) => {
      const message = error instanceof Error ? error.message : "unbekannt";
      console.error(`IMAP-Verbindung: ${message}`);
      reject(error instanceof Error ? error : new Error(message));
    });
  });
  broken.catch(() => undefined);
  return { client, broken };
}

async function withClient<T>(settings: ImapSettings, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const { client, broken } = clientFor(settings);
  try {
    return await Promise.race([
      (async () => {
        await client.connect();
        return await fn(client);
      })(),
      broken,
    ]);
  } catch (error) {
    throw connectionError("IMAP", error);
  } finally {
    await Promise.race([
      client.logout().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 4_000)),
    ]);
    client.close();
  }
}

export const imapAdapter: ImapPort = {
  test(settings) {
    return withClient(settings, async (client) => {
      await client.noop();
    });
  },

  async pull(settings, cursors, limit, onProgress) {
    return withClient(settings, async (client) => pullFolders(client, cursors, limit, onProgress));
  },

  async fetchMessage(settings, folder, uid) {
    return withClient(settings, async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const message = await client.fetchOne(String(uid), { envelope: true, uid: true, bodyStructure: true }, { uid: true });
        if (!message) throw new Error("IMAP: Nachricht nicht gefunden.");
        const textPart = findTextPart(message.bodyStructure, "plain");
        const htmlPart = findTextPart(message.bodyStructure, "html");
        const text = textPart ? await readPart(client, uid, textPart) : "";
        const html = htmlPart && htmlPart.part !== textPart?.part ? await readPart(client, uid, htmlPart) : null;
        const readable = messageText(text, html);
        return {
          subject: message.envelope?.subject ?? "",
          from: formatAddresses(message.envelope?.from),
          to: formatAddresses(message.envelope?.to),
          cc: formatAddresses(message.envelope?.cc),
          date: toIso(message.envelope?.date),
          text: readable.text,
          html,
          links: readable.links,
          attachments: listAttachments(message.bodyStructure),
        } satisfies FullMessage;
      } finally {
        lock.release();
      }
    });
  },

  async fetchAttachment(settings, folder, uid, attachmentId) {
    return withClient(settings, async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const message = await client.fetchOne(String(uid), { uid: true, bodyStructure: true }, { uid: true });
        if (!message) throw new AppError("no_attachment", "Diesen Anhang gibt es an der Nachricht nicht.", 404);
        const listed = listAttachments(message.bodyStructure).find((item) => item.id === attachmentId);
        if (!listed) throw new AppError("no_attachment", "Diesen Anhang gibt es an der Nachricht nicht.", 404);
        if (listed.size !== null && listed.size > MAX_ATTACHMENT_BYTES) {
          throw new AppError("attachment_too_large", "Der Anhang ist größer als 15 MB und wird nicht geladen.", 400);
        }
        const data = await readBytes(client, uid, attachmentId);
        return { ...listed, data, size: data.byteLength } satisfies AttachmentFile;
      } finally {
        lock.release();
      }
    });
  },

  listRemoteFolders(settings) {
    return withClient(settings, async (client) => {
      const listed = await client.list();
      return listed.map((box) => ({
        path: box.path,
        name: box.name,
        delimiter: box.delimiter,
        parentPath: box.parentPath,
        flags: [...box.flags],
        specialUse: box.specialUse ?? null,
        selectable: !box.flags.has("\\Noselect") && !box.flags.has("\\NonExistent"),
        subscribed: box.subscribed,
      })) satisfies ImapFolderInfo[];
    });
  },

  folderStatus(settings, folder) {
    return withClient(settings, async (client) => {
      const status = await client.status(folder, { messages: true, recent: true, unseen: true, uidNext: true, uidValidity: true });
      return {
        path: status.path,
        messages: status.messages ?? 0,
        recent: status.recent ?? 0,
        unseen: status.unseen ?? 0,
        uidNext: status.uidNext ?? 0,
        uidValidity: Number(status.uidValidity ?? 0),
      } satisfies ImapFolderStatus;
    });
  },

  createFolder(settings, folder) {
    return withClient(settings, async (client) => {
      const created = await client.mailboxCreate(folder);
      return { path: created.path, created: created.created };
    });
  },

  renameFolder(settings, folder, newFolder) {
    return withClient(settings, async (client) => {
      const listed = await client.list();
      const current = listed.find((box) => box.path === folder);
      const delimiter = current?.delimiter || listed.find((box) => box.delimiter)?.delimiter || "/";
      const renamed = await client.mailboxRename(folder, newFolder);
      return { path: renamed.path, newPath: renamed.newPath, delimiter };
    });
  },

  deleteFolder(settings, folder) {
    return withClient(settings, async (client) => {
      await client.mailboxDelete(folder);
    });
  },

  setSubscription(settings, folder, subscribed) {
    return withClient(settings, async (client) => {
      const ok = subscribed ? await client.mailboxSubscribe(folder) : await client.mailboxUnsubscribe(folder);
      if (!ok) throw new AppError("imap_store", subscribed ? "IMAP: Der Ordner wurde nicht abonniert." : "IMAP: Das Abonnement wurde nicht aufgehoben.", 400);
    });
  },

  deleteMessages(settings, folder, uids) {
    return withClient(settings, async (client) => {
      await locked(client, folder, async () => {
        const ok = await client.messageDelete(uids, { uid: true });
        if (!ok) throw new AppError("imap_store", "IMAP: Die Nachrichten wurden nicht gelöscht.", 400);
      });
    });
  },

  moveMessages(settings, folder, uids, destination) {
    return withClient(settings, async (client) =>
      locked(client, folder, async () => {
        const moved = await client.messageMove(uids, destination, { uid: true });
        if (!moved) throw new AppError("imap_store", "IMAP: Die Nachrichten wurden nicht verschoben.", 400);
        return relocations(uids, moved.uidMap);
      }),
    );
  },

  copyMessages(settings, folder, uids, destination) {
    return withClient(settings, async (client) =>
      locked(client, folder, async () => {
        const copied = await client.messageCopy(uids, destination, { uid: true });
        if (!copied) throw new AppError("imap_store", "IMAP: Die Nachrichten wurden nicht kopiert.", 400);
        return relocations(uids, copied.uidMap);
      }),
    );
  },

  storeFlags(settings, folder, uids, mode, flags) {
    return withClient(settings, async (client) =>
      locked(client, folder, async () => {
        const options = { uid: true as const };
        const ok = await store(client, uids, mode, flags, options);
        if (!ok) throw new AppError("imap_store", "IMAP: Die Markierungen wurden nicht gesetzt.", 400);
        const fetched = await client.fetchAll(uids, { uid: true, flags: true }, { uid: true });
        return fetched.map((message) => ({ uid: message.uid ?? 0, flags: [...(message.flags ?? [])] })) satisfies StoredFlag[];
      }),
    );
  },

  appendMessage(settings, folder, rfc822, flags) {
    return withClient(settings, async (client) => {
      const body = typeof rfc822 === "string" ? rfc822 : Buffer.from(rfc822);
      const appended = await client.append(folder, body, flags);
      if (!appended) throw new AppError("imap_store", "IMAP: Die Nachricht wurde nicht abgelegt.", 400);
      return { uid: typeof appended.uid === "number" ? appended.uid : null };
    });
  },

  searchUids(settings, folder, criteria) {
    return withClient(settings, async (client) =>
      locked(client, folder, async () => {
        const found = await client.search(toSearchQuery(criteria), { uid: true });
        if (!found || !Array.isArray(found)) throw new AppError("mailbox_connect", "IMAP: Die Suche hat kein Ergebnis geliefert.", 400);
        return found;
      }),
    );
  },
};

async function locked<T>(client: ImapFlow, folder: string, fn: () => Promise<T>): Promise<T> {
  const lock = await client.getMailboxLock(folder);
  try {
    return await fn();
  } finally {
    lock.release();
  }
}

async function store(client: ImapFlow, uids: number[], mode: FlagMode, flags: string[], options: { uid: true }): Promise<boolean> {
  switch (mode) {
    case "set":
      return client.messageFlagsSet(uids, flags, options);
    case "add":
      return client.messageFlagsAdd(uids, flags, options);
    case "remove":
      return client.messageFlagsRemove(uids, flags, options);
    default: {
      const exhaustive: never = mode;
      throw new AppError("bad_flag", `Unbekannte Aktion ${String(exhaustive)}.`, 400);
    }
  }
}

function relocations(uids: number[], uidMap: Map<number, number> | undefined): UidRelocation[] {
  return uids.map((uid) => ({ uid, destinationUid: mappedUid(uidMap, uid) }));
}

function mappedUid(uidMap: Map<number, number> | undefined, uid: number): number | null {
  if (!uidMap) return null;
  const direct = uidMap.get(uid);
  if (typeof direct === "number") return direct;
  for (const [key, value] of uidMap) {
    if (Number(key) === uid && typeof value === "number") return value;
  }
  return null;
}

function toSearchQuery(criteria: ImapSearchCriteria): SearchObject {
  const query: SearchObject = {};
  if (criteria.seen !== undefined) query.seen = criteria.seen;
  if (criteria.flagged !== undefined) query.flagged = criteria.flagged;
  if (criteria.answered !== undefined) query.answered = criteria.answered;
  if (criteria.draft !== undefined) query.draft = criteria.draft;
  if (criteria.deleted !== undefined) query.deleted = criteria.deleted;
  if (criteria.from) query.from = criteria.from;
  if (criteria.to) query.to = criteria.to;
  if (criteria.cc) query.cc = criteria.cc;
  if (criteria.subject) query.subject = criteria.subject;
  if (criteria.body) query.body = criteria.body;
  if (criteria.text) query.text = criteria.text;
  if (criteria.keyword) query.keyword = criteria.keyword;
  if (criteria.since) query.since = searchDate(criteria.since, "since");
  if (criteria.before) query.before = searchDate(criteria.before, "before");
  if (Object.keys(query).length === 0) query.all = true;
  return query;
}

function searchDate(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError("bad_date", `IMAP: ${label} ist kein Datum.`, 400);
  return date;
}

async function pullFolders(
  client: ImapFlow,
  cursors: FolderCursor[],
  limit: number,
  onProgress?: (pull: FolderPull) => void,
): Promise<PullBatch> {
  const listed = await client.list();
  const selectable = listed.filter((box) => !box.flags?.has("\\Noselect"));
  const known = new Map(cursors.map((cursor) => [cursor.folder, cursor]));
  const folders: FolderPull[] = [];
  let remaining = limit;
  let caughtUp = true;
  const emit = (pull: FolderPull) => {
    onProgress?.(pull);
    return pull;
  };

  for (const box of selectable) {
    const cursor = known.get(box.path);
    let lock: { release: () => void };
    try {
      lock = await client.getMailboxLock(box.path);
    } catch (error) {
      if (!missingMailbox(error)) throw error;
      folders.push(emit({
        folder: box.path,
        uidValidity: cursor?.uidValidity ?? 0,
        reset: false,
        messages: [],
        caughtUp: true,
        highestUid: cursor?.lastUid ?? 0,
        remoteCount: 0,
      }));
      continue;
    }
    try {
      const mailbox = client.mailbox;
      if (!mailbox || typeof mailbox === "boolean") continue;
      const uidValidity = Number(mailbox.uidValidity ?? 0);
      const highestPossible = Math.max(0, Number(mailbox.uidNext ?? 1) - 1);
      const reset = Boolean(cursor?.uidValidity && cursor.uidValidity !== uidValidity);
      const after = reset || !cursor ? 0 : cursor.lastUid;
      const remoteCount = Number(mailbox.exists ?? 0);
      const base = { folder: box.path, uidValidity, remoteCount };
      if (!mailbox.exists || after >= highestPossible) {
        folders.push(emit({ ...base, reset, messages: [], caughtUp: true, highestUid: after }));
        continue;
      }
      if (remaining <= 0) {
        caughtUp = false;
        folders.push(emit({ ...base, reset, messages: [], caughtUp: false, highestUid: after }));
        continue;
      }
      emit({ ...base, reset: false, messages: [], caughtUp: false, highestUid: after });
      const found = await client.search({ uid: `${after + 1}:*` }, { uid: true, returnOptions: ["ALL"] });
      const page = uidsFromSearch(found, after, remaining);
      if (!page) throw new AppError("mailbox_connect", "IMAP: Die Nachrichtensuche hat kein verwertbares Ergebnis geliefert.", 400);
      const batch = page.uids;
      const fetched: FetchMessageObject[] = [];
      if (batch.length > 0) {
        for await (const msg of client.fetch(batch, fetchQuery(), { uid: true })) fetched.push(msg);
      }
      const messages: RemoteMessage[] = [];
      let first = true;
      for (const msg of fetched) {
        const remote = await toRemote(client, msg);
        messages.push(remote);
        emit({
          ...base,
          reset: first && reset,
          messages: [remote],
          caughtUp: false,
          highestUid: remote.uid,
        });
        first = false;
      }
      const highestUid = messages.reduce((max, message) => Math.max(max, message.uid), after);
      const folderCaughtUp = page.complete || highestUid >= highestPossible;
      if (!folderCaughtUp) caughtUp = false;
      remaining -= messages.length;
      folders.push({ ...base, reset, messages, caughtUp: folderCaughtUp, highestUid });
      emit({ ...base, reset: false, messages: [], caughtUp: folderCaughtUp, highestUid });
    } finally {
      lock.release();
    }
  }

  return { folders, caughtUp };
}

function fetchQuery() {
  return {
    uid: true,
    flags: true,
    envelope: true,
    internalDate: true,
    bodyStructure: true,
    headers: ["message-id", "references", "in-reply-to"],
  };
}

async function toRemote(client: ImapFlow, msg: FetchMessageObject): Promise<RemoteMessage> {
  const textPart = findTextPart(msg.bodyStructure, "plain") ?? findTextPart(msg.bodyStructure, "html");
  let snippet = "";
  if (textPart && msg.uid) {
    try {
      const raw = await readPart(client, msg.uid, textPart, SNIPPET_BYTES);
      snippet = toSnippet(raw, textPart.subtype);
    } catch {
      snippet = "";
    }
  }
  const messageId = normalizeId(msg.envelope?.messageId ?? headerValue(msg.headers, "message-id"));
  const threadId = normalizeId(firstReference(headerValue(msg.headers, "references")) ?? headerValue(msg.headers, "in-reply-to") ?? messageId);
  const subject = msg.envelope?.subject ?? "";
  return {
    uid: msg.uid ?? 0,
    messageId,
    threadId,
    from: formatAddresses(msg.envelope?.from),
    to: formatAddresses(msg.envelope?.to),
    cc: formatAddresses(msg.envelope?.cc),
    subject,
    date: toIso(msg.envelope?.date ?? msg.internalDate),
    flags: [...(msg.flags ?? [])],
    hasAttachments: listAttachments(msg.bodyStructure).length > 0,
    snippet,
    bodyHash: createHash("sha256").update(`${messageId ?? ""}\n${subject}\n${snippet}`).digest("hex"),
  };
}

type TextPart = { part: string; subtype: "plain" | "html"; charset?: string };

function findTextPart(node: MessageStructureObject | undefined, prefer: "plain" | "html"): TextPart | null {
  if (!node) return null;
  const found: TextPart[] = [];
  walk(node, found);
  return found.find((part) => part.subtype === prefer) ?? null;
}

function walk(node: MessageStructureObject, found: TextPart[]): void {
  const type = (node.type ?? "").toLowerCase();
  if (type === "text/plain" || type === "text/html") {
    found.push({
      part: node.part || "1",
      subtype: type === "text/html" ? "html" : "plain",
      charset: node.parameters?.charset,
    });
  }
  for (const child of node.childNodes ?? []) walk(child, found);
}

async function readBytes(client: ImapFlow, uid: number, part: string): Promise<Uint8Array> {
  const { content } = await client.download(String(uid), part, { uid: true });
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of content) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_ATTACHMENT_BYTES) {
      throw new AppError("attachment_too_large", "Der Anhang ist größer als 15 MB und wird nicht geladen.", 400);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function readPart(client: ImapFlow, uid: number, part: TextPart, maxBytes = 200_000): Promise<string> {
  const { content } = await client.download(String(uid), part.part, { uid: true, maxBytes });
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of content) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buffer);
    size += buffer.length;
    if (size >= maxBytes) break;
  }
  const charset = normalizeCharset(part.charset);
  try {
    return new TextDecoder(charset).decode(Buffer.concat(chunks).subarray(0, maxBytes));
  } catch {
    return Buffer.concat(chunks).subarray(0, maxBytes).toString("utf8");
  }
}

function toSnippet(value: string, subtype: "plain" | "html"): string {
  const text = subtype === "html" ? stripHtml(value) : value;
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}

function formatAddresses(list: Array<{ name?: string; address?: string }> | undefined): string {
  if (!list) return "";
  return list
    .map((item) => (item.name && item.address ? `${item.name} <${item.address}>` : item.address || item.name || ""))
    .filter(Boolean)
    .join(", ");
}

function toIso(value: Date | string | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function headerValue(headers: Buffer | undefined, name: string): string | null {
  if (!headers) return null;
  const text = headers.toString("utf8");
  const match = new RegExp(`^${name}:\\s*(.+)$`, "im").exec(text);
  return match?.[1]?.trim() ?? null;
}

function firstReference(value: string | null): string | null {
  if (!value) return null;
  return value.split(/\s+/).find((part) => part.includes("@") || part.startsWith("<")) ?? null;
}

function normalizeId(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/[<>]/g, "").trim() || null;
}

function normalizeCharset(charset: string | undefined): string {
  if (!charset) return "utf-8";
  const lower = charset.toLowerCase();
  if (lower === "utf8") return "utf-8";
  if (lower === "us-ascii") return "utf-8";
  return lower;
}

