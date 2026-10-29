import type { Request, Response, Router } from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { normalizeAgentName, normalizeFlag, type PublicUser } from "@mailconnect/domain";
import type { Container } from "./container.js";
import { MCP_INSTRUCTIONS, auditedToolRegistrar, type McpAuditContext } from "./mcp-audit.js";

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

const outboundAttachment = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().max(200).optional(),
  contentBase64: z.string().min(1).max(28_000_000),
  contentId: z.string().max(255).optional().describe("optional, für Inline-Bilder per cid:"),
}).strict();

const sendShape = {
  mailboxId: z.string().uuid(),
  to: z.array(z.string()).min(1).max(50),
  cc: z.array(z.string()).max(50).optional(),
  bcc: z.array(z.string()).max(50).optional(),
  subject: z.string().max(998),
  text: z.string().max(1_000_000),
  html: z.string().max(1_000_000).optional(),
  fromName: z.string().max(100, "Der Absendername ist länger als 100 Zeichen.").optional().describe("Überschreibt den Anzeigenamen des Postfachs für diese eine Mail"),
  attachments: z.array(outboundAttachment).max(10).optional().describe("Anhänge als Base64, höchstens 10, zusammen höchstens 20 MB nach dem Dekodieren"),
  saveToSent: z.boolean().optional().describe("Kopie in Gesendet. Weglassen folgt dem Postfach. false überspringt die Kopie. true erzwingt sie, auch wenn der Server selbst speichert."),
  flags: z.array(z.string().min(1).max(64)).max(20).optional().describe("Zusätzliche IMAP-Markierungen für die Kopie in Gesendet, zum Beispiel \\Flagged oder prio. Betrifft nur deinen Gesendet-Ordner, nicht den Empfänger. \\Seen ist immer gesetzt. \\Draft und \\Deleted sind hier nicht erlaubt."),
  priority: z.enum(["high", "normal", "low"]).optional().describe("Priorität für den Empfänger: setzt X-Priority, X-MSMail-Priority und Importance in der Mail. high = dringend. Unabhängig von flags."),
};

export function mountMcp(router: Router, container: Container): void {
  router.all("/mcp", async (req, res) => {
    try {
      const token = bearerToken(req);
      const auth = token ? container.tokens.authenticateToken(token) : null;
      const ip = req.ip ?? null;
      const userAgent = firstHeader(req.headers["user-agent"])?.slice(0, 300) ?? null;
      const headerAgent = normalizeAgentName(firstHeader(req.headers["x-agent-name"]));
      if (!auth) {
        container.audit.record({
          userId: null,
          source: "mcp",
          category: "auth",
          action: "mcp.auth",
          status: "denied",
          agentName: headerAgent,
          error: token ? "Token ungültig oder widerrufen." : "Bearer-Token fehlt.",
          ip,
          userAgent,
        });
        res.status(401).setHeader("WWW-Authenticate", 'Bearer realm="mailconnect"').json({
          error: "unauthorized",
          message: token ? "Token ungültig." : "Bearer-Token erforderlich.",
        });
        return;
      }
      const context: McpAuditContext = {
        user: auth.user,
        tokenId: auth.token.id,
        tokenName: auth.token.name,
        headerAgent,
        runId: firstHeader(req.headers["x-agent-run-id"])?.slice(0, 120) ?? null,
        ip,
        userAgent,
      };
      recordHandshake(container, context, req);
      await handleMcp(container, auth.user, context, req, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : "MCP-Fehler";
      if (!res.headersSent) res.status(500).json({ error: "mcp", message });
    }
  });
}

/** Der Verbindungsaufbau (initialize) trägt den Client-Namen und wird als Sitzungsereignis festgehalten. */
function recordHandshake(container: Container, context: McpAuditContext, req: Request): void {
  const body = req.body as { method?: unknown; params?: { clientInfo?: { name?: unknown; version?: unknown } } } | undefined;
  if (body?.method !== "initialize") return;
  const client = body.params?.clientInfo;
  container.audit.record({
    userId: context.user.id,
    source: "mcp",
    category: "session",
    action: "mcp.initialize",
    status: "ok",
    tokenId: context.tokenId,
    tokenName: context.tokenName,
    agentName: context.headerAgent ?? normalizeAgentName(client?.name),
    runId: context.runId,
    input: { clientName: client?.name ?? null, clientVersion: client?.version ?? null },
    ip: context.ip,
    userAgent: context.userAgent,
  });
}

async function handleMcp(container: Container, user: PublicUser, audit: McpAuditContext, req: Request, res: Response): Promise<void> {
  const server = new McpServer({ name: "mailconnect", version: "1.0.0" }, { instructions: MCP_INSTRUCTIONS });
  registerTools(server, container, user, audit);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

function registerTools(server: McpServer, container: Container, user: PublicUser, audit: McpAuditContext): void {
  const tool = auditedToolRegistrar(server, container, audit);
  tool(
    "list_mailboxes",
    "Listet die Mailkonten inklusive description und instructions. displayName ist der Absendername beim Versand. lastSyncAt und indexStatus zeigen, ob der Abgleich läuft. Fehlt eine Mail oder ist der Stand alt, rufe sync_mailbox auf. Webhooks für neue Post trägst du mit set_mailbox_webhooks ein. Ordner, die bei einem Webhook still bleiben sollen, trägst du mit set_webhook_folders ein. Signaturen holst du mit list_mailbox_signatures und legst sie mit save_mailbox_signature an. Die Handlungsanweisungen sind verbindlich: handle nur innerhalb dieser Regeln.",
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
        sentFolder: mailbox.sentFolder,
        serverStoresSent: mailbox.serverStoresSent,
      })),
    }),
  );

  tool("get_index_stats", "Gibt eine Übersicht über Konten und den aufgebauten Mail-Index.", {}, async () =>
    json(container.sync.stats(user)),
  );

  tool(
    "list_folders",
    "Listet die bekannten IMAP-Ordner eines Kontos aus dem Index. Mit parent nur die direkten Unterordner. Ein leerer parent listet nur die oberste Ebene.",
    folderParent,
    async ({ mailboxId, parent }) => json({ folders: container.mail.folders(user, mailboxId, parent) }),
  );

  tool(
    "list_imap_folders",
    "Liest die Ordner direkt vom IMAP-Server, inklusive Sonderordner wie Papierkorb oder Entwürfe. Mit parent nur die direkten Unterordner. Ein leerer parent listet nur die oberste Ebene.",
    folderParent,
    async ({ mailboxId, parent }) => json({ folders: await container.mail.listRemoteFolders(user, mailboxId, parent) }),
  );

  tool(
    "folder_status",
    "Fragt beim IMAP-Server Anzahl, ungelesene Nachrichten und die nächste UID eines Ordners ab.",
    { mailboxId: z.string().uuid(), folder: z.string().min(1).max(400) },
    async ({ mailboxId, folder }) => json(await container.mail.folderStatus(user, mailboxId, folder)),
  );

  tool(
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

  tool(
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

  tool(
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

  tool(
    "delete_messages",
    bound("Löscht Nachrichten endgültig auf dem IMAP-Server und nimmt sie aus dem Index. Entweder messageIds aus search_messages, oder mailboxId, folder und uids aus search_imap."),
    messageTarget,
    async (input) => json(await container.mail.deleteMessages(user, input)),
  );

  tool(
    "move_messages",
    bound("Verschiebt Nachrichten in einen anderen IMAP-Ordner und zieht den Index mit. Entweder messageIds, oder mailboxId, folder und uids."),
    { ...messageTarget, destination: z.string().min(1).max(400).describe("Zielordner, zum Beispiel Trash oder INBOX/Archiv") },
    async (input) => json(await container.mail.moveMessages(user, input, input.destination)),
  );

  tool(
    "copy_messages",
    bound("Kopiert Nachrichten in einen anderen IMAP-Ordner. Die Originale bleiben liegen."),
    { ...messageTarget, destination: z.string().min(1).max(400) },
    async (input) => json(await container.mail.copyMessages(user, input, input.destination)),
  );

  tool(
    "set_message_flags",
    bound("Setzt, ergänzt oder entfernt IMAP-Markierungen wie \\Seen, \\Flagged, \\Answered, \\Draft oder \\Deleted."),
    flagShape,
    async (input) => json(await container.mail.setFlags(user, input, input.mode, input.flags)),
  );

  tool(
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

  tool(
    "append_message",
    bound("Legt eine neue Nachricht in einen Ordner, zum Beispiel Entwürfe. Entweder raw als RFC822, höchstens 28 MB, oder subject und text. flags setzt zum Beispiel \\Draft. Zum Ersetzen einer Kopie die alte Nachricht mit delete_messages löschen und die vollständige hier ablegen."),
    {
      mailboxId: z.string().uuid(),
      folder: z.string().min(1).max(400),
      flags: z.array(z.string().min(1).max(64)).max(20).optional(),
      raw: z.string().max(28_000_000).optional().describe("Vollständige RFC822-Nachricht, höchstens 28 MB"),
      to: z.array(z.string()).max(50).optional(),
      cc: z.array(z.string()).max(50).optional(),
      subject: z.string().max(998).optional(),
      text: z.string().max(1_000_000).optional(),
    },
    async (input) => json(await container.mail.appendMessage(user, input)),
  );

  tool(
    "create_folder",
    "Legt einen IMAP-Ordner an. Der Pfad ist der volle Name, zum Beispiel Projekte oder INBOX/Projekte.",
    { mailboxId: z.string().uuid(), folder: z.string().min(1).max(400) },
    async ({ mailboxId, folder }) => json(await container.mail.createFolder(user, mailboxId, folder)),
  );

  tool(
    "rename_folder",
    bound("Benennt einen IMAP-Ordner um. Unterordner ziehen mit. INBOX lässt sich nicht umbenennen."),
    { mailboxId: z.string().uuid(), folder: z.string().min(1).max(400), newFolder: z.string().min(1).max(400) },
    async ({ mailboxId, folder, newFolder }) => json(await container.mail.renameFolder(user, mailboxId, folder, newFolder)),
  );

  tool(
    "delete_folder",
    bound("Löscht einen IMAP-Ordner und die Nachrichten darin. INBOX lässt sich nicht löschen. Ein Ordner mit Unterordnern bleibt, bis die Unterordner weg sind."),
    { mailboxId: z.string().uuid(), folder: z.string().min(1).max(400) },
    async ({ mailboxId, folder }) => json(await container.mail.deleteFolder(user, mailboxId, folder)),
  );

  tool(
    "set_folder_subscription",
    "Abonniert einen IMAP-Ordner oder hebt das Abonnement auf.",
    { mailboxId: z.string().uuid(), folder: z.string().min(1).max(400), subscribed: z.boolean() },
    async ({ mailboxId, folder, subscribed }) => json(await container.mail.setFolderSubscription(user, mailboxId, folder, subscribed)),
  );

  tool(
    "send_email",
    standingOrders
      ? `Sendet eine E-Mail über das SMTP des gewählten Kontos. Der Absendername ist der Anzeigename des Postfachs. fromName überschreibt ihn für diese Mail, höchstens 100 Zeichen. Anhänge kommen als Base64, höchstens 10 Dateien und zusammen 20 MB. Vor dem Senden sieh in list_mailbox_signatures nach und hänge die passende Signatur an den Text. Ihre Handlungsanweisungen sind verbindlich. priority steuert die Dringlichkeit beim Empfänger (X-Priority / Importance): high, normal oder low. flags markiert nur die Kopie in Gesendet, zum Beispiel \\Flagged. Danach legt MailConnect genau diese Nachricht im Ordner Gesendet ab, mit \\Seen. Sind flags gesetzt, wird die Kopie auch dann abgelegt, wenn der Server Gesendet selbst speichert. saveToSent steuert die Kopie sonst. Die Antwort nennt sentFolder, sentUid, savedToSent und bei einem Fehler saveError. Der Versand bleibt gültig, wenn nur das Ablegen scheitert. Die Handlungsanweisungen des Postfachs sind verbindlich. Wenn sie eine menschliche Zustimmung verlangen, sende nicht.\n\n${standingOrders}`
      : "Sendet eine E-Mail über das SMTP des gewählten Kontos. Der Absendername ist der Anzeigename des Postfachs. fromName überschreibt ihn für diese Mail, höchstens 100 Zeichen. Stehen am Postfach Handlungsanweisungen, sind sie verbindlich. Vor dem Senden sieh in list_mailbox_signatures nach und hänge die passende Signatur an den Text. Ihre Handlungsanweisungen sind verbindlich. Anhänge kommen als Base64, höchstens 10 Dateien und zusammen 20 MB. priority steuert die Dringlichkeit beim Empfänger (X-Priority / Importance): high, normal oder low. flags markiert nur die Kopie in Gesendet, zum Beispiel \\Flagged. Danach legt MailConnect genau diese Nachricht im Ordner Gesendet ab, mit \\Seen. Sind flags gesetzt, wird die Kopie auch dann abgelegt, wenn der Server Gesendet selbst speichert. saveToSent steuert die Kopie sonst. Die Antwort nennt sentFolder, sentUid, savedToSent und bei einem Fehler saveError. Der Versand bleibt gültig, wenn nur das Ablegen scheitert.",
    sendShape,
    async (input) => json(await container.mail.send(user, input)),
  );

  tool(
    "list_mailbox_webhooks",
    "Zeigt die Webhooks eines Postfachs: Adresse, Methode, Header und excludedFolders. Den Schlüssel selbst liefert die Antwort nicht. excludedFolders gilt pro Webhook: diese Ordner lösen ihn nicht aus. Eine leere Liste bedeutet: jeder Ordner löst aus. mailboxId kommt aus list_mailboxes.",
    { mailboxId: z.string().uuid() },
    async ({ mailboxId }) => json(webhookView(container.mailboxes.getOwned(user, mailboxId))),
  );

  tool(
    "set_mailbox_webhooks",
    "Trägt die Webhooks eines Postfachs ein. Die Liste ersetzt die bisherige vollständig; Einträge, die fehlen, fallen weg. Eine leere Liste entfernt alle. Höchstens 5. Jede Adresse ist öffentlich und beginnt mit https://. method ist POST, PUT oder PATCH, Standard POST. secret wird als Authorization: Bearer geschickt, sofern header kein Authorization setzt. header ist genau eine Zeile Name: Wert. excludedFolders gilt nur für diesen Webhook; weglassen behält seine bisherige Ordnerliste. mailboxId kommt aus list_mailboxes. Rufe das Werkzeug auf, wenn der Nutzer einen Webhook hinterlegen oder ändern will.",
    {
      mailboxId: z.string().uuid(),
      webhooks: z.array(z.object({
        url: z.string().max(500).describe("Öffentliche https-Adresse"),
        method: z.enum(["POST", "PUT", "PATCH"]).optional().describe("Standard ist POST"),
        secret: z.string().max(500).optional().describe("Schlüssel. Wird als Authorization: Bearer geschickt, wenn header kein Authorization setzt"),
        header: z.string().max(500).optional().describe("Eine Zeile Name: Wert, zum Beispiel Authorization: Bearer …"),
        excludedFolders: z.array(z.string().max(400)).max(200).optional().describe("IMAP-Pfade, die diesen Webhook nicht auslösen. Weglassen behält die bisherige Liste."),
      }).strict()).max(5),
    },
    async ({ mailboxId, webhooks }) => json(webhookView(container.mailboxes.setWebhooks(user, mailboxId, webhooks))),
  );

  tool(
    "set_webhook_folders",
    "Legt für einen einzelnen Webhook fest, welche Ordner ihn nicht auslösen. Standard ist eine leere Liste: neue Post in jedem Ordner wird gemeldet. url ist die Adresse aus list_mailbox_webhooks. excludedFolders ersetzt die Liste dieses Webhooks. Ein leeres Array schaltet alle Ordner wieder ein. Der Name ist der IMAP-Pfad aus list_folders, zum Beispiel INBOX oder INBOX.Spam. Ein Unterordner bleibt aktiv, bis er selbst in der Liste steht.",
    {
      mailboxId: z.string().uuid(),
      url: z.string().max(500).describe("Adresse des Webhooks aus list_mailbox_webhooks"),
      excludedFolders: z.array(z.string().max(400)).max(200).describe("IMAP-Pfade, die diesen Webhook nicht auslösen. Leer heißt: alle Ordner lösen aus."),
    },
    async ({ mailboxId, url, excludedFolders }) => json(webhookView(container.mailboxes.setWebhookFolders(user, mailboxId, url, excludedFolders))),
  );

  tool(
    "list_mailbox_signatures",
    "Listet die Signaturen eines Postfachs. Genau eine ist die Standard-Signatur, isDefault ist true. kind ist plain oder html. instructions sind Handlungsanweisungen und verbindlich. body ist der Text, den du an die Mail hängst. previewPath öffnet die gerenderte Signatur in MailConnect. mailboxId kommt aus list_mailboxes.",
    { mailboxId: z.string().uuid() },
    async ({ mailboxId }) => json(signatureView(container.mailboxes.getOwned(user, mailboxId))),
  );

  tool(
    "save_mailbox_signature",
    "Legt eine Signatur an oder ändert sie. Ohne id entsteht ein neuer Eintrag. Mit id wird genau diese Signatur ersetzt. kind ist plain oder html. title ist der Name. instructions sind Handlungsanweisungen für Agents und verbindlich. body ist der Signaturtext, bei html das Markup. isDefault true macht sie zur Standard-Signatur und nimmt einer anderen diesen Status. Die erste Signatur wird immer die Standard-Signatur. Höchstens 50 pro Postfach. mailboxId kommt aus list_mailboxes.",
    {
      mailboxId: z.string().uuid(),
      id: z.string().uuid().optional().describe("Vorhandene Signatur. Weglassen legt eine neue an."),
      title: z.string().min(1).max(120),
      kind: z.enum(["plain", "html"]),
      body: z.string().max(200_000),
      instructions: z.string().max(2000),
      isDefault: z.boolean().optional().describe("true macht diese Signatur zur Standard-Signatur."),
    },
    async ({ mailboxId, id, title, kind, body, instructions, isDefault }) =>
      json(signatureView(container.mailboxes.saveSignature(user, mailboxId, { id, title, kind, body, instructions, isDefault }))),
  );

  tool(
    "delete_mailbox_signature",
    "Löscht eine Signatur. signatureId kommt aus list_mailbox_signatures. War sie die Standard-Signatur, wird die nächste verbliebene zur Standard-Signatur.",
    { mailboxId: z.string().uuid(), signatureId: z.string().uuid() },
    async ({ mailboxId, signatureId }) => json(signatureView(container.mailboxes.deleteSignature(user, mailboxId, signatureId))),
  );

  tool(
    "sync_mailbox",
    "Stößt den IMAP-Abgleich an, wenn er nicht von allein gelaufen ist oder eine erwartete Mail in der Suche fehlt. Der automatische Abgleich läuft etwa alle zwei Minuten. Ohne mailboxId werden alle eigenen Postfächer angestoßen, außer gestoppte und reine Versandkonten. Mit mailboxId startet auch ein gestopptes Postfach wieder. Der Abgleich läuft danach im Hintergrund weiter. Suche anschließend erneut.",
    { mailboxId: z.string().uuid().optional().describe("Ein Konto. Weglassen stößt alle eigenen Postfächer an, die nicht gestoppt sind.") },
    async ({ mailboxId }) => {
      const requested = container.sync.request(user, mailboxId);
      for (const item of requested) {
        if (item.started) container.indexer.nudge(item.mailbox.id);
      }
      return json({
        mailboxes: requested.map((item) => {
          const progress = container.sync.progress(item.mailbox.id);
          return {
            id: item.mailbox.id,
            displayName: item.mailbox.displayName,
            email: item.mailbox.email,
            indexStatus: item.mailbox.indexStatus,
            indexedCount: item.mailbox.indexedCount,
            messageTotal: progress.messageTotal,
            folderTotal: progress.folderTotal,
            folderDone: progress.folderDone,
            lastSyncAt: item.mailbox.lastSyncAt,
            lastError: item.mailbox.lastError,
            started: item.started,
          };
        }),
      });
    },
  );
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

function webhookView(mailbox: { id: string; displayName: string; email: string; webhooks: { url: string; method: string; secret: string; header: string; excludedFolders?: string[] }[] }) {
  return {
    mailboxId: mailbox.id,
    displayName: mailbox.displayName,
    email: mailbox.email,
    webhooks: mailbox.webhooks.map((hook) => ({
      url: hook.url,
      method: hook.method,
      secretSet: hook.secret.length > 0,
      header: hook.header,
      excludedFolders: hook.excludedFolders ?? [],
    })),
  };
}

function signatureView(mailbox: { id: string; signatures: { id: string; title: string; kind: string; body: string; instructions: string; isDefault: boolean }[] }) {
  return {
    mailboxId: mailbox.id,
    signatures: mailbox.signatures.map((signature) => ({
      ...signature,
      previewPath: `/mailconnect/mailboxes/${mailbox.id}/signaturen/${signature.id}`,
    })),
  };
}

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function toFts(query: string): string | undefined {
  const tokens = query.trim().split(/\s+/).filter(Boolean).slice(0, 12);
  if (tokens.length === 0) return undefined;
  return tokens.map((token) => `"${token.replace(/"/g, "")}"*`).join(" AND ");
}
