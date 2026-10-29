import { AppError } from "./errors.js";
import type { AuditRepository, Clock, IdGenerator } from "./ports.js";
import type {
  AuditAgentSummary,
  AuditEvent,
  AuditEventDraft,
  AuditFilter,
  AuditScope,
  AuditVerification,
  PublicUser,
} from "./types.js";

const SECRET_KEY = /pass(word)?|secret|token|authorization|api[-_]?key|^header$/i;
const LONG_TEXT_KEYS = new Set(["text", "body"]);
const SHORT_LIMIT = 2_000;
const LONG_LIMIT = 20_000;
const MAX_DEPTH = 6;
const MAX_ITEMS = 100;
export const AGENT_NAME_MAX = 80;

/**
 * Entfernt Geheimnisse und kürzt große Werte, bevor sie ins Audit-Log wandern.
 * Base64-Anhänge werden nur als Größe festgehalten, HTML nur als Länge.
 */
export function redactForAudit(value: unknown, key = "", depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") {
    if (SECRET_KEY.test(key)) return value ? "[redacted]" : "";
    if (key === "contentBase64") return `[${Math.floor((value.length * 3) / 4)} Bytes]`;
    if (key === "html") return `[HTML, ${value.length} Zeichen]`;
    const limit = LONG_TEXT_KEYS.has(key) ? LONG_LIMIT : SHORT_LIMIT;
    return value.length > limit ? `${value.slice(0, limit)}… [${value.length} Zeichen gesamt]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= MAX_DEPTH) return "[…]";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((item) => redactForAudit(item, key, depth + 1));
    if (value.length > MAX_ITEMS) items.push(`[… ${value.length - MAX_ITEMS} weitere]`);
    return items;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactForAudit(v, k, depth + 1);
    return out;
  }
  return String(value);
}

export function normalizeAgentName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const name = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return null;
  return name.slice(0, AGENT_NAME_MAX);
}

export class AuditService {
  constructor(
    private readonly events: AuditRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /** Schreibt ein Ereignis. Ein Fehler hier darf die eigentliche Aktion nie kippen. */
  record(draft: AuditEventDraft): AuditEvent | null {
    try {
      return this.events.insert(
        {
          ...draft,
          resource: (redactForAudit(draft.resource ?? {}) as Record<string, unknown>) ?? {},
          input: draft.input === undefined ? null : redactForAudit(draft.input),
          output: draft.output === undefined ? null : redactForAudit(draft.output),
          error: draft.error ? draft.error.slice(0, SHORT_LIMIT) : null,
        },
        this.ids.newId(),
        this.clock.now(),
      );
    } catch (error) {
      console.error("Audit", error instanceof Error ? error.message : error);
      return null;
    }
  }

  list(user: PublicUser, filter: AuditFilter): { events: AuditEvent[]; total: number } {
    return this.events.list(scopeOf(user), { ...filter, limit: Math.min(Math.max(filter.limit ?? 100, 1), 500) });
  }

  export(user: PublicUser, filter: AuditFilter): AuditEvent[] {
    return this.events.list(scopeOf(user), { ...filter, limit: 50_000, before: filter.before }).events;
  }

  get(user: PublicUser, id: string): AuditEvent {
    const event = this.events.find(scopeOf(user), id);
    if (!event) throw new AppError("not_found", "Audit-Eintrag nicht gefunden.", 404);
    return event;
  }

  agents(user: PublicUser, since?: string): AuditAgentSummary[] {
    return this.events.agents(scopeOf(user), since);
  }

  verify(user: PublicUser): AuditVerification {
    if (user.role !== "admin") throw new AppError("forbidden", "Nur Administratoren dürfen die Kette prüfen.", 403);
    return this.events.verify();
  }
}

function scopeOf(user: PublicUser): AuditScope {
  return { userId: user.id, includeUnowned: user.role === "admin" };
}
