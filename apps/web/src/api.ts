import { formatDate, localizeError } from './i18n';

export type Role = string;
export interface User { id: string; email: string; username: string | null; role: Role }
export interface Channel { host: string; port: number; secure: boolean; username: string }
export interface ChannelInput extends Channel { password?: string }
export type IndexStatus = 'idle' | 'syncing' | 'paused' | 'error' | 'disabled';
export type WebhookMethod = 'POST' | 'PUT' | 'PATCH';
export interface MailboxWebhook { url: string; method: WebhookMethod; secret: string; header: string; excludedFolders: string[] }
export type SignatureKind = 'plain' | 'html';
export interface MailSignature { id: string; title: string; kind: SignatureKind; body: string; instructions: string; isDefault: boolean }
export interface Mailbox {
  id: string; displayName: string; description: string; instructions: string; webhooks: MailboxWebhook[]; webhookExcludedFolders: string[]; email: string; providerId: string;
  imap: Channel | null; smtp: Channel | null;
  sentFolder: string; serverStoresSent: boolean;
  signatures: MailSignature[];
  indexStatus: IndexStatus; indexedCount: number;
  messageTotal: number | null; folderTotal: number; folderDone: number;
  lastSyncAt: string | null; lastError: string | null;
  createdAt: string; updatedAt: string;
}
export interface MailboxInput {
  displayName: string; description: string; instructions: string; webhooks: MailboxWebhook[]; email: string; providerId: string;
  imap: ChannelInput | null; smtp: ChannelInput | null;
  sentFolder: string; serverStoresSent: boolean;
}
export interface Provider {
  id: string; name: string; region: string; note?: string;
  imap?: { host: string; port: number; secure: boolean };
  smtp?: { host: string; port: number; secure: boolean };
}
export interface Stats {
  mailboxCount: number; imapCount: number; smtpOnlyCount: number;
  indexedMessages: number; syncing: number; errors: number; lastSyncAt: string | null;
}
export interface TestResult {
  imap?: { ok: boolean; error?: string }; smtp?: { ok: boolean; error?: string };
}
export interface MessageSummary {
  id: string; mailboxId: string; folder: string; uid: number;
  from: string; to: string; cc: string; subject: string; date: string;
  flags: string[] | string; hasAttachments: boolean; snippet: string;
}
export interface MessageBody {
  subject: string; from: string; to: string; cc: string; date: string;
  text: string | null; html: string | null;
  links?: Array<{ href: string; text: string }>;
  attachments?: Array<{ id: string; filename: string; contentType: string; size: number | null }>;
}
export interface Invite { id: string; email: string | null; expiresAt: string; usedAt: string | null; createdAt: string }
export interface TokenRow { id: string; name: string; createdAt: string; revokedAt: string | null; lastUsedAt: string | null }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}api/${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try { data = await res.json(); } catch { /* leer */ }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string };
    throw new ApiError(res.status, d.error ?? 'error', d.message ?? `Anfrage fehlgeschlagen (${res.status})`, data);
  }
  return data as T;
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return localizeError(e.code, e.message);
  return e instanceof Error ? e.message : localizeError('unknown', '');
}

export function fmtDate(iso: string | null | undefined): string {
  return formatDate(iso);
}

export type AuditCategory = 'read' | 'write' | 'delete' | 'send' | 'sync' | 'admin' | 'auth' | 'session' | 'flow';
export type AuditStatus = 'ok' | 'error' | 'denied';
export type AuditSource = 'mcp' | 'web' | 'system';
export interface AuditEvent {
  seq: number; id: string; ts: string; userId: string | null;
  source: AuditSource; category: AuditCategory; action: string; status: AuditStatus; durationMs: number | null;
  tokenId: string | null; tokenName: string | null; agentName: string | null; runId: string | null;
  mailboxId: string | null; mailboxEmail: string | null;
  resource: Record<string, unknown>; input: unknown; output: unknown; error: string | null;
  ip: string | null; userAgent: string | null; prevHash: string; hash: string;
}
export interface AuditAgent {
  tokenId: string | null; tokenName: string | null; agentName: string | null;
  calls: number; errors: number; sends: number; deletes: number; tools: string[]; firstSeen: string; lastSeen: string;
}
export interface AuditFilter {
  agent: string; tokenId: string; action: string; category: string; status: string; source: string; mailboxId: string; since: string; until: string; q: string;
}
