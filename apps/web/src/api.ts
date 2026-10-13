import { formatDate, localizeError } from './i18n';

export type Role = string;
export interface User { id: string; email: string; role: Role }
export interface Channel { host: string; port: number; secure: boolean; username: string }
export interface ChannelInput extends Channel { password?: string }
export type IndexStatus = 'idle' | 'syncing' | 'paused' | 'error' | 'disabled';
export interface Mailbox {
  id: string; displayName: string; description: string; instructions: string; email: string; providerId: string;
  imap: Channel | null; smtp: Channel | null;
  indexStatus: IndexStatus; indexedCount: number;
  messageTotal: number | null; folderTotal: number; folderDone: number;
  lastSyncAt: string | null; lastError: string | null;
  createdAt: string; updatedAt: string;
}
export interface MailboxInput {
  displayName: string; description: string; instructions: string; email: string; providerId: string;
  imap: ChannelInput | null; smtp: ChannelInput | null;
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
