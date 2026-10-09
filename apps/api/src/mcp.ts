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
      const user = userFromBearer(container, req);
      if (!user) {
        res.status(401).setHeader("WWW-Authenticate", 'Bearer realm="mailconnect"').json({
          error: "unauthorized",
          message: "Bearer-Token erforderlich.",
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
  server.tool("list_mailboxes", "Listet die Mailkonten des angemeldeten Benutzers inklusive Indexstatus.", {}, async () =>
    json({
      mailboxes: container.mailboxes.list(user).map((mailbox) => ({
        id: mailbox.id,
        displayName: mailbox.displayName,
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
    "Durchsucht den lokalen Mail-Index. Liefert Metadaten und einen Textausschnitt, nicht den vollständigen Body.",
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
      return json({ messages });
    },
  );

  server.tool("get_message", "Lädt eine indexierte Nachricht vollständig vom IMAP-Server.", messageShape, async ({ messageId }) => {
    const message = await container.mail.read(user, messageId);
    return json({
      id: message.indexed.id,
      mailboxId: message.indexed.mailboxId,
      folder: message.indexed.folder,
      uid: message.indexed.uid,
      subject: message.subject,
      from: message.from,
      to: message.to,
      cc: message.cc,
      date: message.date,
      flags: message.indexed.flags,
      text: message.text.slice(0, 100_000),
    });
  });

  server.tool("send_email", "Sendet eine E-Mail über das SMTP des gewählten Kontos.", sendShape, async (input) => {
    await container.mail.send(user, input);
    return json({ ok: true });
  });

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

function userFromBearer(container: Container, req: Request): PublicUser | null {
  const header = req.headers.authorization;
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return container.tokens.authenticate(header.slice(7).trim());
}

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function toFts(query: string): string | undefined {
  const tokens = query.trim().split(/\s+/).filter(Boolean).slice(0, 12);
  if (tokens.length === 0) return undefined;
  return tokens.map((token) => `"${token.replace(/"/g, "")}"*`).join(" AND ");
}
