import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { normalizeAgentName, AGENT_NAME_MAX, type AuditCategory, type PublicUser } from "@mailconnect/domain";
import type { Container } from "./container.js";

export type McpAuditContext = {
  user: PublicUser;
  tokenId: string;
  tokenName: string;
  /** Name aus dem Header X-Agent-Name, falls vorhanden. */
  headerAgent: string | null;
  runId: string | null;
  ip: string | null;
  userAgent: string | null;
};

export const MCP_INSTRUCTIONS =
  "Jeder Aufruf wird revisionssicher protokolliert. Nenne bei JEDEM Werkzeugaufruf im Parameter `agent` deinen eigenen Namen (zum Beispiel \"Vertrieb-Agent\" oder \"Support-Nora\"), auch wenn mehrere Agents denselben Token teilen. Ohne Namen lehnt MailConnect den Aufruf ab.";

const agentShape = z
  .string()
  .max(AGENT_NAME_MAX * 2)
  .optional()
  .describe("PFLICHT: Dein Name als Agent (z. B. \"Support-Nora\"). Mehrere Agents dürfen sich einen Token teilen, der Name macht jede Aktion zuordenbar.");

const CATEGORY: Record<string, AuditCategory> = {
  list_mailboxes: "read",
  get_index_stats: "read",
  list_folders: "read",
  list_imap_folders: "read",
  folder_status: "read",
  search_messages: "read",
  search_imap: "read",
  get_message: "read",
  get_attachment: "read",
  list_mailbox_webhooks: "read",
  list_mailbox_signatures: "read",
  delete_messages: "delete",
  delete_folder: "delete",
  delete_mailbox_signature: "delete",
  send_email: "send",
  sync_mailbox: "sync",
  set_mailbox_webhooks: "admin",
  set_webhook_folders: "admin",
  save_mailbox_signature: "admin",
};

const SCALAR_OUTPUT = [
  "ok", "messageId", "mailboxId", "folder", "uid", "subject", "from", "to", "date", "filename", "contentType", "size",
  "attachmentCount", "sentFolder", "sentUid", "savedToSent", "saveError", "started", "moved", "copied", "deleted", "count",
] as const;

type TargetMessage = { id: string; folder: string; uid: number; from: string; subject: string };

export function auditedToolRegistrar(server: McpServer, container: Container, ctx: McpAuditContext) {
  return function tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    handler: (input: z.infer<z.ZodObject<S>>) => Promise<CallToolResult>,
  ): void {
    const run = async (args: Record<string, unknown>): Promise<CallToolResult> => {
      const { agent, ...input } = args;
      const agentName = normalizeAgentName(agent) ?? ctx.headerAgent ?? (container.config.requireAgentName ? null : "unbekannt");
      const category = CATEGORY[name] ?? "write";
      const target = resolveTarget(container, ctx.user, input);
      const base = {
        userId: ctx.user.id,
        source: "mcp" as const,
        category,
        action: name,
        tokenId: ctx.tokenId,
        tokenName: ctx.tokenName,
        agentName,
        runId: ctx.runId,
        mailboxId: target.mailboxId,
        mailboxEmail: target.mailboxEmail,
        resource: target.resource,
        input,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      };
      if (!agentName) {
        container.audit.record({
          ...base,
          status: "denied",
          error: "Agent-Name fehlt. Aufruf abgelehnt.",
        });
        return {
          isError: true,
          content: [{
            type: "text",
            text: "Abgelehnt: Dieser Aufruf nennt keinen Agent-Namen. Wiederhole ihn mit dem Parameter `agent` (dein eigener Name) oder dem Header X-Agent-Name. Mehrere Agents dürfen sich einen Token teilen, jeder muss sich aber mit Namen melden.",
          }],
        };
      }
      const started = Date.now();
      try {
        const result = await handler(input as z.infer<z.ZodObject<S>>);
        container.audit.record({
          ...base,
          status: result.isError ? "error" : "ok",
          durationMs: Date.now() - started,
          output: digestResult(result),
          error: result.isError ? firstText(result).slice(0, 2000) : null,
        });
        return result;
      } catch (error) {
        container.audit.record({
          ...base,
          status: "error",
          durationMs: Date.now() - started,
          error: error instanceof Error ? error.message : "Unbekannter Fehler",
        });
        throw error;
      }
    };
    server.tool(name, description, { ...shape, agent: agentShape } as z.ZodRawShape, run as never);
  };
}

function resolveTarget(container: Container, user: PublicUser, input: Record<string, unknown>) {
  const resource: Record<string, unknown> = {};
  const messages: TargetMessage[] = [];
  let mailboxId = typeof input.mailboxId === "string" ? input.mailboxId : null;
  const ids = [
    ...(typeof input.messageId === "string" ? [input.messageId] : []),
    ...(Array.isArray(input.messageIds) ? input.messageIds.filter((id): id is string => typeof id === "string") : []),
  ];
  for (const id of ids.slice(0, 50)) {
    try {
      const message = container.mail.getIndexed(user, id);
      messages.push({ id: message.id, folder: message.folder, uid: message.uid, from: message.from, subject: message.subject });
      mailboxId ??= message.mailboxId;
    } catch {
      messages.push({ id, folder: "", uid: 0, from: "", subject: "[nicht im Index]" });
    }
  }
  for (const key of ["folder", "newFolder", "destination", "uids", "attachmentId", "url"] as const) {
    if (input[key] !== undefined) resource[key] = input[key];
  }
  if (messages.length > 0) resource.messages = messages;
  let mailboxEmail: string | null = null;
  if (mailboxId) {
    try {
      mailboxEmail = container.mailboxes.list(user).find((mailbox) => mailbox.id === mailboxId)?.email ?? null;
    } catch {
      mailboxEmail = null;
    }
  }
  return { mailboxId, mailboxEmail, resource };
}

function firstText(result: CallToolResult): string {
  for (const part of result.content) {
    if (part.type === "text") return part.text;
  }
  return "";
}

/** Fasst zusammen, was der Agent zurückbekommen hat: Anzahl, Mail-Kennungen, Größen. Keine Bodys. */
export function digestResult(result: CallToolResult): Record<string, unknown> {
  let bytes = 0;
  const attachments: Array<{ type: string; bytes: number }> = [];
  for (const part of result.content) {
    if (part.type === "text") bytes += Buffer.byteLength(part.text);
    else if (part.type === "resource" && "blob" in part.resource && typeof part.resource.blob === "string") {
      const size = Math.floor((part.resource.blob.length * 3) / 4);
      bytes += size;
      attachments.push({ type: part.resource.mimeType ?? "application/octet-stream", bytes: size });
    }
  }
  const digest: Record<string, unknown> = { bytes };
  if (attachments.length > 0) digest.files = attachments;
  let parsed: unknown;
  try {
    parsed = JSON.parse(firstText(result));
  } catch {
    return digest;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return digest;
  const record = parsed as Record<string, unknown>;
  for (const key of SCALAR_OUTPUT) {
    const value = record[key];
    if (typeof value === "string") digest[key] = value.slice(0, 300);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) digest[key] = value;
  }
  if (typeof record.text === "string") digest.textChars = record.text.length;
  for (const [key, value] of Object.entries(record)) {
    if (!Array.isArray(value)) continue;
    digest[`${key}Count`] = value.length;
    if (key === "messages") {
      digest.delivered = value.slice(0, 50).map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return { id: row.id, folder: row.folder, uid: row.uid, from: row.from, subject: row.subject };
      });
    } else if (key === "attachments") {
      digest.attachments = value.slice(0, 50).map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return { id: row.id, filename: row.filename, contentType: row.contentType, size: row.size };
      });
    } else if (key === "mailboxes") {
      digest.mailboxes = value.slice(0, 50).map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return { id: row.id, email: row.email };
      });
    }
  }
  return digest;
}
