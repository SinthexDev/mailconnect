import type { Request, Response, Router } from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { PublicUser } from "@mailconnect/domain";
import type { Container } from "./container.js";

const searchShape = {
  query: z.string().max(200).optional().describe("Freitext über Betreff, Absender und Ausschnitt"),
  mailboxId: z.string().uuid().optional().describe("Optional auf ein Konto einschränken"),
  folder: z.string().max(400).optional(),
  since: z.string().max(40).optional().describe("ISO-Datum, inklusive"),
  until: z.string().max(40).optional().describe("ISO-Datum, inklusive"),
  limit: z.number().int().min(1).max(50).optional(),
};

const messageShape = {
  messageId: z.string().uuid().describe("Index-ID aus search_messages"),
};

const sendShape = {
  mailboxId: z.string().uuid(),
  to: z.array(z.string()).min(1).max(50),
  cc: z.array(z.string()).max(50).optional(),
  bcc: z.array(z.string()).max(50).optional(),
  subject: z.string().max(998),
  text: z.string().max(1_000_000),
  html: z.string().max(1_000_000).optional(),
};

export function mountMcp(router: Router, container: Container): void {
  router.all("/mcp", async (req, res) => {
    try {
      const token = bearerToken(req);
      const user = token ? container.tokens.authenticate(token) : null;
      if (!user) {
        res.status(401).setHeader("WWW-Authenticate", 'Bearer realm="mailconnect"').json({
          error: "unauthorized",
          message: token ? "Token ungültig." : "Bearer-Token erforderlich.",
        });
        return;
      }
      await handleMcp(container, user, req, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : "MCP-Fehler";
      if (!res.headersSent) res.status(500).json({ error: "mcp", message });
    }
  });
}

async function handleMcp(container: Container, user: PublicUser, req: Request, res: Response): Promise<void> {
  const server = new McpServer({ name: "mailconnect", version: "1.0.0" });
  registerTools(server, container, user);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

function registerTools(server: McpServer, container: Container, user: PublicUser): void {
  server.tool(
    "list_mailboxes",
    "Listet die Mailkonten inklusive description und instructions. Die Beschreibung sagt, wofür ein Postfach gedacht ist. Die Handlungsanweisungen sind verbindlich: handle nur innerhalb dieser Regeln.",
    {},
    async () =>
    json({
      mailboxes: container.mailboxes.list(user).map((mailbox) => ({
        id: mailbox.id,
        displayName: mailbox.displayName,
        description: mailbox.description,
        instructions: mailbox.instructions,
        email: mailbox.email,
        providerId: mailbox.providerId,
        hasImap: Boolean(mailbox.imap),
        hasSmtp: Boolean(mailbox.smtp),
        indexStatus: mailbox.indexStatus,
        indexedCount: mailbox.indexedCount,
        lastSyncAt: mailbox.lastSyncAt,
        lastError: mailbox.lastError,
      })),
    }),
  );

  server.tool("get_index_stats", "Gibt eine Übersicht über Konten und den aufgebauten Mail-Index.", {}, async () =>
    json(container.sync.stats(user)),
  );

  server.tool("list_folders", "Listet die bekannten IMAP-Ordner eines Kontos aus dem Index.", { mailboxId: z.string().uuid() }, async ({ mailboxId }) =>
    json({ folders: container.mail.folders(user, mailboxId) }),
  );

  server.tool(
    "search_messages",
    "Durchsucht den lokalen Mail-Index. Liefert Metadaten, mailboxDescription, mailboxInstructions und einen Textausschnitt, nicht den vollständigen Body. Befolge die Handlungsanweisungen.",
    searchShape,
    async (input) => {
      const messages = container.mail.search({
        userId: user.id,
        text: input.query ? toFts(input.query) : undefined,
        mailboxId: input.mailboxId,
        folder: input.folder,
        since: input.since,
        until: input.until,
        limit: input.limit ?? 20,
      });
      const mailboxes = new Map(container.mailboxes.list(user).map((mailbox) => [mailbox.id, mailbox]));
      return json({
        messages: messages.map((message) => {
          const mailbox = mailboxes.get(message.mailboxId);
          return {
            ...message,
            mailboxDescription: mailbox?.description ?? "",
            mailboxInstructions: mailbox?.instructions ?? "",
          };
        }),
      });
    },
  );

  server.tool(
    "get_message",
    "Lädt eine indexierte Nachricht vom IMAP-Server, inklusive der Liste attachments mit id, filename, contentType und size. Den Dateiinhalt lädst du mit get_attachment. Befolge mailboxInstructions.",
    messageShape,
    async ({ messageId }) => {
      const message = await container.mail.read(user, messageId);
      const mailbox = container.mailboxes.list(user).find((item) => item.id === message.indexed.mailboxId);
      return json({
        id: message.indexed.id,
        mailboxId: message.indexed.mailboxId,
        mailboxDescription: mailbox?.description ?? "",
        mailboxInstructions: mailbox?.instructions ?? "",
        folder: message.indexed.folder,
        uid: message.indexed.uid,
        subject: message.subject,
        from: message.from,
        to: message.to,
        cc: message.cc,
        date: message.date,
        flags: message.indexed.flags,
        text: message.text.slice(0, 100_000),
        attachments: message.attachments,
      });
    },
  );

  server.tool(
    "get_attachment",
    "Lädt einen Anhang einer indexierten Nachricht, zum Beispiel eine PDF-Rechnung. Nimm die id aus get_message.attachments. Die Datei kommt als Inhalt mit.",
    {
      messageId: z.string().uuid().describe("Index-ID aus search_messages"),
      attachmentId: z.string().min(1).max(40).describe("id aus attachments"),
    },
    async ({ messageId, attachmentId }) => {
      const file = await container.mail.readAttachment(user, messageId, attachmentId);
      const bytes = Buffer.from(file.data);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              id: file.id,
              filename: file.filename,
              contentType: file.contentType,
              size: bytes.byteLength,
            }),
          },
          {
            type: "resource" as const,
            resource: {
              uri: `mailconnect://messages/${messageId}/attachments/${file.id}/${encodeURIComponent(file.filename)}`,
              mimeType: file.contentType,
              blob: bytes.toString("base64"),
            },
          },
        ],
      };
    },
  );

  const standingOrders = container.mailboxes.list(user)
    .filter((mailbox) => mailbox.instructions.trim())
    .map((mailbox) => `${mailbox.displayName} (${mailbox.email}): ${mailbox.instructions}`)
    .join("\n");
  server.tool(
    "send_email",
    standingOrders
      ? `Sendet eine E-Mail über das SMTP des gewählten Kontos. Die Handlungsanweisungen sind verbindlich. Wenn sie eine menschliche Zustimmung verlangen, sende nicht.\n\n${standingOrders}`
      : "Sendet eine E-Mail über das SMTP des gewählten Kontos. Stehen am Postfach Handlungsanweisungen, sind sie verbindlich.",
    sendShape,
    async (input) => {
      await container.mail.send(user, input);
      return json({ ok: true });
    },
  );

  server.tool("sync_mailbox", "Stößt die Index-Synchronisation eines IMAP-Kontos an.", { mailboxId: z.string().uuid() }, async ({ mailboxId }) => {
    const mailbox = container.sync.enqueue(user, mailboxId);
    if (mailbox.imap) container.indexer.nudge(mailbox.id);
    return json({
      id: mailbox.id,
      indexStatus: mailbox.indexStatus,
      indexedCount: mailbox.indexedCount,
      lastSyncAt: mailbox.lastSyncAt,
    });
  });
}

function bearerToken(req: Request): string | null {
  const header = firstHeader(req.headers.authorization);
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  const apiKey = firstHeader(req.headers["x-api-key"]);
  if (apiKey) return apiKey;
  return null;
}

function firstHeader(value: string | string[] | undefined): string | null {
  const header = Array.isArray(value) ? value[0] : value;
  const token = header?.trim();
  return token ? token : null;
}

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function toFts(query: string): string | undefined {
  const tokens = query.trim().split(/\s+/).filter(Boolean).slice(0, 12);
  if (tokens.length === 0) return undefined;
  return tokens.map((token) => `"${token.replace(/"/g, "")}"*`).join(" AND ");
}
