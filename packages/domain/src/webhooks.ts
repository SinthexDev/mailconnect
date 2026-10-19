import { AppError } from "./errors.js";
import type { FolderCursor, MailboxWebhook, WebhookMethod } from "./types.js";

export const MAX_WEBHOOKS = 5;
export const MAX_EXCLUDED_FOLDERS = 200;
const METHODS = new Set<WebhookMethod>(["POST", "PUT", "PATCH"]);

export function isFreshArrival(cursor: FolderCursor | undefined, pull: { reset: boolean; messages: readonly unknown[] }): boolean {
  return Boolean(cursor && cursor.status === "idle" && !pull.reset && pull.messages.length > 0);
}

export function parseWebhookList(values: readonly unknown[]): MailboxWebhook[] {
  const seen = new Set<string>();
  const hooks: MailboxWebhook[] = [];
  for (const raw of values) {
    const draft = normalizeWebhook(raw);
    if (!draft) continue;
    if (hooks.length >= MAX_WEBHOOKS) throw new AppError("too_many_webhooks", "Höchstens 5 Webhook-Adressen.", 400);
    const url = publicHttpsUrl(draft.url);
    const header = cleanHeader(draft.header);
    const secret = cleanField(draft.secret, "Der Webhook-Schlüssel ist ungültig.");
    if (seen.has(url)) continue;
    seen.add(url);
    hooks.push({ url, method: draft.method, secret, header, excludedFolders: draft.excludedFolders });
  }
  return hooks;
}

export function parseExcludedFolders(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const folders: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") throw new AppError("invalid_webhook_folder", "Ein Ordnername ist ungültig.", 400);
    const folder = raw.trim();
    if (!folder || folder.length > 400 || /[\u0000-\u001f\u007f]/.test(folder)) {
      throw new AppError("invalid_webhook_folder", "Ein Ordnername ist ungültig.", 400);
    }
    if (seen.has(folder)) continue;
    if (folders.length >= MAX_EXCLUDED_FOLDERS) {
      throw new AppError("too_many_webhook_folders", "Höchstens 200 ausgeschlossene Ordner.", 400);
    }
    seen.add(folder);
    folders.push(folder);
  }
  return folders;
}

export function webhookFolderIncluded(folder: string, excluded: readonly string[]): boolean {
  return !excluded.includes(folder);
}

export function webhookRequestHeaders(hook: MailboxWebhook): { method: WebhookMethod; headers: Record<string, string> } {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "MailConnect",
  };
  if (hook.header) {
    const split = hook.header.indexOf(":");
    const name = hook.header.slice(0, split).trim().toLowerCase();
    headers[name] = hook.header.slice(split + 1).trim();
  }
  if (hook.secret && !headers.authorization) headers.authorization = `Bearer ${hook.secret}`;
  return { method: hook.method, headers };
}

function normalizeWebhook(raw: unknown): { url: string; method: WebhookMethod; secret: string; header: string; excludedFolders: string[] } | null {
  if (typeof raw === "string") {
    const url = raw.trim();
    return url ? { url, method: "POST", secret: "", header: "", excludedFolders: [] } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const record = raw as { url?: unknown; method?: unknown; secret?: unknown; header?: unknown; excludedFolders?: unknown };
  const url = typeof record.url === "string" ? record.url.trim() : "";
  if (!url) return null;
  return {
    url,
    method: webhookMethod(record.method),
    secret: typeof record.secret === "string" ? record.secret : "",
    header: typeof record.header === "string" ? record.header : "",
    excludedFolders: Array.isArray(record.excludedFolders) ? parseExcludedFolders(record.excludedFolders) : [],
  };
}

function webhookMethod(value: unknown): WebhookMethod {
  if (value === undefined || value === "") return "POST";
  const method = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!METHODS.has(method as WebhookMethod)) {
    throw new AppError("invalid_webhook", "Die Webhook-Methode muss POST, PUT oder PATCH sein.", 400);
  }
  return method as WebhookMethod;
}

function publicHttpsUrl(value: string): string {
  if (value.length > 500) throw new AppError("invalid_webhook", "Die Webhook-Adresse ist ungültig.", 400);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("invalid_webhook", "Die Webhook-Adresse ist ungültig.", 400);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new AppError("invalid_webhook", "Eine Webhook-Adresse muss mit https:// beginnen.", 400);
  }
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || isBlockedHost(host)) {
    throw new AppError("invalid_webhook", "Die Webhook-Adresse muss öffentlich erreichbar sein.", 400);
  }
  return url.href;
}

function cleanHeader(value: string): string {
  const header = value.trim();
  if (!header) return "";
  if (header.length > 500) throw new AppError("invalid_webhook", "Der Webhook-Header ist zu lang.", 400);
  const split = header.indexOf(":");
  const name = split > 0 ? header.slice(0, split).trim() : "";
  const headerValue = split > 0 ? header.slice(split + 1).trim() : "";
  if (!/^[A-Za-z0-9-]{1,64}$/.test(name) || !headerValue || /[\u0000-\u001f\u007f]/.test(header)) {
    throw new AppError("invalid_webhook", "Der Webhook-Header muss aus Name und Wert bestehen, zum Beispiel Authorization: Bearer ….", 400);
  }
  if (/^(host|content-length|connection|transfer-encoding)$/i.test(name)) {
    throw new AppError("invalid_webhook", "Diesen Webhook-Header kann MailConnect nicht setzen.", 400);
  }
  return `${name}: ${headerValue}`;
}

function cleanField(value: string, message: string): string {
  const trimmed = value.trim();
  if (trimmed.length > 500 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new AppError("invalid_webhook", message, 400);
  }
  return trimmed;
}

export function isPublicAddress(address: string): boolean {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped?.[1]) return isPublicAddress(mapped[1]);
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    if (octets.some((n) => n > 255)) return false;
    const a = octets[0] ?? 0;
    const b = octets[1] ?? 0;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a >= 224) return false;
    return true;
  }
  if (!address.includes(":")) return false;
  const v6 = address.toLowerCase();
  if (v6 === "::" || v6 === "::1") return false;
  if (v6.startsWith("fc") || v6.startsWith("fd")) return false;
  if (/^fe[89ab]/.test(v6)) return false;
  if (v6.startsWith("ff")) return false;
  return true;
}

function isBlockedHost(host: string): boolean {
  return isIpLiteral(host) && !isPublicAddress(host);
}

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":");
}
