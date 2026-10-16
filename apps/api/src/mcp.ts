import type { Request, Response, Router } from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { normalizeFlag, type PublicUser } from "@mailconnect/domain";
import type { Container } from "./container.js";

const searchShape = {
  query: z.string().max(200).optional().describe("Freitext über Betreff, Absender und Ausschnitt"),
  mailboxId: z.string().uuid().optional().describe("Optional auf ein Konto einschränken"),
  folder: z.string().max(400).optional(),
  flag: z.string().max(64).optional().describe("Nur Nachrichten mit dieser Markierung, zum Beispiel \\Flagged oder \\Seen"),
  since: z.string().max(40).optional().describe("ISO-Datum, inklusive"),
  until: z.string().max(40).optional().describe("ISO-Datum, inklusive"),
  limit: z.number().int().min(1).max(50).optional(),
};

const messageShape = {
  messageId: z.string().uuid().describe("Index-ID aus search_messages"),
};

const folderParent = {
  mailboxId: z.string().uuid(),
  parent: z.string().max(400).optional().describe("Nur die direkten Unterordner dieses Pfads. Leerer String: nur die oberste Ebene. Weglassen: alle Ordner."),
};

const messageTarget = {
  messageIds: z.array(z.string().uuid()).min(1).max(100).optional().describe("Index-IDs aus search_messages. Alle müssen im selben Ordner liegen."),
  mailboxId: z.string().uuid().optional().describe("Zusammen mit folder und uids, wenn die Nachricht nicht über die Index-ID kommt"),
  folder: z.string().min(1).max(400).optional(),
  uids: z.array(z.number().int().positive().max(4_294_967_295)).min(1).max(100).optional().describe("IMAP-UIDs aus search_imap"),
};

const flagShape = {
  ...messageTarget,
  mode: z.enum(["set", "add", "remove"]).describe("set ersetzt alle Markierungen, add ergänzt, remove nimmt weg"),
  flags: z.array(z.string().min(1).max(64)).max(20).describe("\\Seen, \\Flagged, \\Answered, \\Draft, \\Deleted oder ein eigenes Wort"),
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

  server.tool(
    "list_folders",
    "Listet die bekannten IMAP-Ordner eines Kontos aus dem Index. Mit parent nur die direkten Unterordner. Ein leerer parent listet nur die oberste Ebene.",
    folderParent,
    async ({ mailboxId, parent }) => json({ folders: container.mail.folders(user, mailboxId, parent) }),
  );

  server.tool(
    "list_imap_folders",
    "Liest die Ordner direkt vom IMAP-Server, inklusive Sonderordner wie Papierkorb oder Entwürfe. Mit parent nur die direkten Unterordner. Ein leerer parent listet nur die oberste Ebene.",
    folderParent,
    async ({ mailboxId, parent }) => json({ folders: await container.mail.listRemoteFolders(user, mailboxId, parent) }),
  );

  server.tool(
    "folder_status",
    "Fragt beim IMAP-Server Anzahl, ungelesene Nachrichten und die nächste UID eines Ordners ab.",
    { mailboxId: z.string().uuid(), folder: z.string().min(1).max(400) },
    async ({ mailboxId, folder }) => json(await container.mail.folderStatus(user, mailboxId, folder)),
  );

  server.tool(
    "search_messages",
    "Durchsucht den lokalen Mail-Index. Liefert Metadaten, Flags, mailboxDescription, mailboxInstructions und einen Textausschnitt, nicht den vollständigen Body. Mit flag nur markierte Nachrichten, zum Beispiel \\Flagged. Befolge die Handlungsanweisungen.",
    searchShape,
    async (input) => {
      const messages = container.mail.search({
        userId: user.id,
        text: input.query ? toFts(input.query) : undefined,
        mailboxId: input.mailboxId,
        folder: input.folder,
        flag: input.flag ? normalizeFlag(input.flag) : undefined,
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
    "Lädt eine indexierte Nachricht vom IMAP-Server. text ist der Inhalt. links enthält die Ziele von Buttons und Links aus dem HTML, auch wenn der reine Text sie verschweigt. attachments nennt Anhänge; den Dateiinhalt lädst du mit get_attachment. Befolge mailboxInstructions.",
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
        links: message.links,
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
  const bound = (text: string) => (standingOrders ? `${text} Die Handlungsanweisungen sind verbindlich.\n\n${standingOrders}` : text);

  server.tool(
    "delete_messages",
    bound("Löscht Nachrichten endgültig auf dem IMAP-Server und nimmt sie aus dem Index. Entweder messageIds aus search_messages, oder mailboxId, folder und uids aus search_imap."),
    messageTarget,
    async (input) => json(await container.mail.deleteMessages(user, input)),
  );

  server.tool(
    "move_messages",
    bound("Verschiebt Nachrichten in einen anderen IMAP-Ordner und zieht den Index mit. Entweder messageIds, oder mailboxId, folder und uids."),
    { ...messageTarget, destination: z.string().min(1).max(400).describe("Zielordner, zum Beispiel Trash oder INBOX/Archiv") },
    async (input) => json(await container.mail.moveMessages(user, input, input.destination)),
  );

  server.tool(
    "copy_messages",
    bound("Kopiert Nachrichten in einen anderen IMAP-Ordner. Die Originale bleiben liegen."),
    { ...messageTarget, destination: z.string().min(1).max(400) },
    async (input) => json(await container.mail.copyMessages(user, input, input.destination)),
  );

  server.tool(
    "set_message_flags",
    bound("Setzt, ergänzt oder entfernt IMAP-Markierungen wie \\Seen, \\Flagged, \\Answered, \\Draft oder \\Deleted."),
    flagShape,
    async (input) => json(await container.mail.setFlags(user, input, input.mode, input.flags)),
  );

  server.tool(
    "search_imap",
    "Sucht direkt auf dem IMAP-Server in einem Ordner und liefert UIDs. Treffer aus dem Index kommen mit id zurück, für get_message, delete_messages und move_messages. Mindestens ein Kriterium ist nötig.",
    {
      mailboxId: z.string().uuid(),
      folder: z.string().min(1).max(400),
      seen: z.boolean().optional().describe("true: gelesen, false: ungelesen"),
      flagged: z.boolean().optional(),
      answered: z.boolean().optional(),
      draft: z.boolean().optional(),
      deleted: z.boolean().optional(),
      from: z.string().max(200).optional(),
      to: z.string().max(200).optional(),
      cc: z.string().max(200).optional(),
      subject: z.string().max(200).optional(),
      body: z.string().max(200).optional().describe("Text nur im Nachrichtentext"),
      text: z.string().max(200).optional().describe("Text in Kopfzeilen und Nachricht"),
      since: z.string().max(40).optional().describe("ISO-Datum, Nachrichten ab diesem Tag"),
      before: z.string().max(40).optional().describe("ISO-Datum, Nachrichten vor diesem Tag"),
      keyword: z.string().max(64).optional().describe("Eigene Markierung oder \\Flagged, \\Seen und so weiter"),
    },
    async (input) => json(await container.mail.searchImap(user, input.mailboxId, input.folder, input)),
  );

  server.tool(
    "append_message",
    bound("Legt eine neue Nachricht in einen Ordner, zum Beispiel Entwürfe. Entweder raw als RFC822, oder subject und text. flags setzt zum Beispiel \\Draft."),
    {
      mailboxId: z.string().uuid(),
      folder: z.string().min(1).max(400),
      flags: z.array(z.string().min(1).max(64)).max(20).optional(),
      raw: z.string().max(1_000_000).optional().describe("Vollständige RFC822-Nachricht"),
      to: z.array(z.string()).max(50).optional(),
      cc: z.array(z.string()).max(50).optional(),
      subject: z.string().max(998).optional(),
      text: z.string().max(1_000_000).optional(),
    },
    async (input) => json(await container.mail.appendMessage(user, input)),
  );

  server.tool(
    "create_folder",
    "Legt einen IMAP-Ordner an. Der Pfad ist der volle Name, zum Beispiel Projekte oder INBOX/Projekte.",
    { mailboxId: z.string().uuid(), folder: z.string().min(1).max(400) },
    async ({ mailboxId, folder }) => json(await container.mail.createFolder(user, mailboxId, folder)),
  );

  server.tool(
    "rename_folder",
    bound("Benennt einen IMAP-Ordner um. Unterordner ziehen mit. INBOX lässt sich nicht umbenennen."),
    { mailboxId: z.string().uuid(), folder: z.string().min(1).max(400), newFolder: z.string().min(1).max(400) },
    async ({ mailboxId, folder, newFolder }) => json(await container.mail.renameFolder(user, mailboxId, folder, newFolder)),
  );

  server.tool(
    "delete_folder",
    bound("Löscht einen IMAP-Ordner und die Nachrichten darin. INBOX lässt sich nicht löschen. Ein Ordner mit Unterordnern bleibt, bis die Unterordner weg sind."),
    { mailboxId: z.string().uuid(), folder: z.string().min(1).max(400) },
    async ({ mailboxId, folder }) => json(await container.mail.deleteFolder(user, mailboxId, folder)),
  );

  server.tool(
    "set_folder_subscription",
    "Abonniert einen IMAP-Ordner oder hebt das Abonnement auf.",
    { mailboxId: z.string().uuid(), folder: z.string().min(1).max(400), subscribed: z.boolean() },
    async ({ mailboxId, folder, subscribed }) => json(await container.mail.setFolderSubscription(user, mailboxId, folder, subscribed)),
  );

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
