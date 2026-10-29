import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { AppError, unauthorized, type AuditCategory, type Mailbox, type PublicUser } from "@mailconnect/domain";
import type { Container } from "./container.js";
import { mountMcp } from "./mcp.js";

const COOKIE = "mc_session";

const webActors = new WeakMap<Request, PublicUser>();

const AUDIT_SKIP = new Set([
  "GET /api/health",
  "GET /api/auth/me",
  "GET /api/providers",
  "GET /api/stats",
  "GET /api/mailboxes",
  "GET /api/tokens",
  "GET /api/invites",
  "POST /api/cron/sync",
]);

const auditFilterSchema = z.object({
  agent: z.string().max(120).optional(),
  tokenId: z.string().max(80).optional(),
  action: z.string().max(120).optional(),
  category: z.enum(["read", "write", "delete", "send", "sync", "admin", "auth", "session", "flow"]).optional(),
  status: z.enum(["ok", "error", "denied"]).optional(),
  source: z.enum(["mcp", "web", "system"]).optional(),
  mailboxId: z.string().max(80).optional(),
  runId: z.string().max(120).optional(),
  since: z.string().max(40).optional(),
  until: z.string().max(40).optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  before: z.coerce.number().int().min(1).optional(),
});

const channelSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(2000).optional(),
});

const draftSchema = z.object({
  displayName: z.string().max(120).optional().default(""),
  description: z.string().max(500).optional().default(""),
  instructions: z.string().max(2000).optional().default(""),
  webhooks: z.array(z.object({
    url: z.string().max(500),
    method: z.enum(["POST", "PUT", "PATCH"]).optional().default("POST"),
    secret: z.string().max(500).optional().default(""),
    header: z.string().max(500).optional().default(""),
    excludedFolders: z.array(z.string().max(400)).max(200).optional().default([]),
  }).strict()).max(5).optional().default([]),
  email: z.string().trim().min(3).max(320),
  providerId: z.string().max(80).nullable().optional().default(null),
  imap: channelSchema.nullable().optional().default(null),
  smtp: channelSchema.nullable().optional().default(null),
  sentFolder: z.string().max(400).optional().default(""),
  serverStoresSent: z.boolean().optional().default(false),
});

const sendSchema = z.object({
  mailboxId: z.string().uuid(),
  to: z.union([z.string(), z.array(z.string())]),
  cc: z.union([z.string(), z.array(z.string())]).optional(),
  bcc: z.union([z.string(), z.array(z.string())]).optional(),
  subject: z.string().max(998).default(""),
  text: z.string().max(1_000_000).default(""),
  html: z.string().max(1_000_000).optional(),
  fromName: z.string().max(100, "Der Absendername ist länger als 100 Zeichen.").optional(),
  attachments: z.array(z.object({
    filename: z.string().min(1).max(255),
    contentType: z.string().max(200).optional(),
    contentBase64: z.string().min(1).max(28_000_000),
    contentId: z.string().max(255).optional(),
  }).strict()).max(10).optional(),
  saveToSent: z.boolean().optional(),
  flags: z.array(z.string().min(1).max(64)).max(20).optional(),
  priority: z.enum(["high", "normal", "low"]).optional(),
});

export function createApp(container: Container): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  const router = express.Router();
  router.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });
  router.use(express.json({ limit: "40mb" }));
  mountMcp(router, container);
  router.use("/api", auditWeb(container));
  mountApi(router, container);
  mountSpa(router, container);
  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.locals.auditError = error instanceof Error ? error.message : String(error);
    if (error instanceof AppError) {
      res.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    if (isTooLarge(error)) {
      res.status(413).json({ error: "payload_too_large", message: "Die Anfrage ist zu groß. Anhänge dürfen zusammen 20 MB nicht überschreiten." });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation", message: error.issues[0]?.message ?? "Ungültige Eingabe." });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "internal", message: "Interner Fehler." });
  });
  if (container.config.basePath) app.use(container.config.basePath, router);
  else app.use(router);
  return app;
}

function mountApi(router: express.Router, container: Container): void {
  const loginHits = new Map<string, { count: number; reset: number }>();

  router.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.post("/api/cron/sync", (req, res) => {
    if (!authorizedCron(container.config.cronSecret, req.get("x-cron-secret"))) {
      res.status(401).json({ error: "unauthorized", message: "Anmeldung erforderlich." });
      return;
    }
    container.indexer.kick();
    res.status(202).json({ ok: true });
  });

  router.post("/api/auth/login", asyncRoute(async (req, res) => {
    const body = z.object({
      login: z.string().max(320).optional(),
      email: z.string().max(320).optional(),
      password: z.string().max(2000),
    }).parse(req.body);
    const login = (body.login ?? body.email ?? "").trim();
    if (!login) throw new AppError("invalid_login", "Anmeldung oder Passwort ist falsch.", 401);
    const key = login.toLowerCase();
    if (limited(loginHits, key)) throw new AppError("rate_limited", "Zu viele Versuche. Bitte später erneut versuchen.", 429);
    const result = await container.auth.login(login, body.password);
    webActors.set(req, result.user);
    loginHits.delete(key);
    setSession(res, container, result.token);
    res.json({ user: result.user });
  }));

  router.post("/api/auth/logout", (req, res) => {
    const token = readCookie(req.headers.cookie, COOKIE);
    if (token) container.auth.logout(token);
    clearSession(res, container);
    res.status(204).end();
  });

  router.get("/api/auth/me", (req, res) => {
    res.json({ user: currentUser(container, req) });
  });

  router.post("/api/auth/accept-invite", asyncRoute(async (req, res) => {
    const body = z.object({
      token: z.string().min(20).max(200),
      email: z.string().max(320),
      password: z.string().max(2000),
    }).parse(req.body);
    const result = await container.auth.acceptInvite(body.token, body.email, body.password);
    webActors.set(req, result.user);
    setSession(res, container, result.token);
    res.status(201).json({ user: result.user });
  }));

  router.post("/api/auth/change-password", asyncRoute(async (req, res) => {
    const user = currentUser(container, req);
    const body = z.object({ currentPassword: z.string().max(2000), newPassword: z.string().max(2000) }).parse(req.body);
    await container.auth.changePassword(user.id, body.currentPassword, body.newPassword);
    res.status(204).end();
  }));

  router.post("/api/auth/username", asyncRoute(async (req, res) => {
    const user = currentUser(container, req);
    const body = z.object({ username: z.string().max(64).nullable().optional() }).parse(req.body ?? {});
    const updated = container.auth.updateUsername(user.id, body.username ?? null);
    res.json({ user: updated });
  }));

  router.get("/api/invites", (req, res) => {
    res.json({ invites: container.auth.listInvites(currentUser(container, req)) });
  });

  router.post("/api/invites", (req, res) => {
    const body = z.object({
      email: z.string().max(320).optional().nullable(),
      ttlHours: z.number().int().min(1).max(24 * 30).optional(),
    }).parse(req.body ?? {});
    const invite = container.auth.createInvite(currentUser(container, req), body.email ?? null, body.ttlHours ?? 72);
    res.status(201).json({
      invite: {
        id: invite.id,
        email: invite.email,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
        url: `${container.config.publicUrl}/join?token=${encodeURIComponent(invite.token)}`,
      },
    });
  });

  router.get("/api/tokens", (req, res) => {
    res.json({ tokens: container.tokens.list(currentUser(container, req)) });
  });

  router.post("/api/tokens", (req, res) => {
    const body = z.object({ name: z.string() }).parse(req.body);
    const created = container.tokens.create(currentUser(container, req), body.name);
    res.status(201).json({ token: created.token, secret: created.secret });
  });

  router.delete("/api/tokens/:id", (req, res) => {
    container.tokens.revoke(currentUser(container, req), req.params.id);
    res.status(204).end();
  });

  router.get("/api/audit", (req, res) => {
    const filter = auditFilterSchema.parse(req.query);
    res.json(container.audit.list(currentUser(container, req), filter));
  });

  router.get("/api/audit/agents", (req, res) => {
    const query = z.object({ since: z.string().max(40).optional() }).parse(req.query);
    res.json({ agents: container.audit.agents(currentUser(container, req), query.since) });
  });

  router.get("/api/audit/verify", (req, res) => {
    res.json(container.audit.verify(currentUser(container, req)));
  });

  router.get("/api/audit/export", (req, res) => {
    const query = auditFilterSchema.extend({ format: z.enum(["json", "csv"]).optional() }).parse(req.query);
    const { format, ...filter } = query;
    const user = currentUser(container, req);
    const events = container.audit.export(user, filter);
    container.audit.record({
      userId: user.id,
      source: "web",
      category: "admin",
      action: "audit.export",
      status: "ok",
      input: { format: format ?? "json", ...filter },
      output: { rows: events.length },
      ip: req.ip ?? null,
      userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
    });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    res.setHeader("Content-Disposition", `attachment; filename="mailconnect-audit-${stamp}.${format === "csv" ? "csv" : "json"}"`);
    if (format === "csv") {
      res.type("text/csv; charset=utf-8").send(auditCsv(events));
      return;
    }
    res.type("application/json").send(JSON.stringify(events, null, 2));
  });

  router.get("/api/audit/:id", (req, res) => {
    res.json({ event: container.audit.get(currentUser(container, req), req.params.id) });
  });

  router.get("/api/providers", (_req, res) => {
    res.json({ providers: container.providers.list() });
  });

  router.get("/api/stats", (req, res) => {
    res.json({ stats: container.sync.stats(currentUser(container, req)) });
  });

  router.get("/api/mailboxes", (req, res) => {
    const mailboxes = container.mailboxes.list(currentUser(container, req));
    res.json({ mailboxes: mailboxes.map((mailbox) => publicMailbox(mailbox, container.sync.progress(mailbox.id))) });
  });

  router.post("/api/mailboxes/test", asyncRoute(async (req, res) => {
    const result = await container.mailboxes.testDraft(draftSchema.parse(req.body));
    const failed = Boolean((result.imap && !result.imap.ok) || (result.smtp && !result.smtp.ok));
    res.status(failed ? 422 : 200).json(result);
  }));

  router.post("/api/mailboxes", asyncRoute(async (req, res) => {
    const mailbox = await container.mailboxes.create(currentUser(container, req), draftSchema.parse(req.body));
    res.status(201).json({ mailbox: publicMailbox(mailbox, container.sync.progress(mailbox.id)) });
  }));

  router.patch("/api/mailboxes/:id/webhooks", asyncRoute(async (req, res) => {
    const body = z.object({
      webhooks: z.array(z.object({
        url: z.string().max(500),
        method: z.enum(["POST", "PUT", "PATCH"]).optional().default("POST"),
        secret: z.string().max(500).optional().default(""),
        header: z.string().max(500).optional().default(""),
        excludedFolders: z.array(z.string().max(400)).max(200).optional().default([]),
      }).strict()).max(5),
    }).parse(req.body);
    const user = currentUser(container, req);
    const mailbox = container.mailboxes.setWebhooks(user, req.params.id, body.webhooks);
    res.json({ mailbox: publicMailbox(mailbox, container.sync.progress(mailbox.id)) });
  }));

  router.patch("/api/mailboxes/:id", asyncRoute(async (req, res) => {
    const mailbox = await container.mailboxes.update(currentUser(container, req), req.params.id, draftSchema.parse(req.body));
    res.json({ mailbox: publicMailbox(mailbox, container.sync.progress(mailbox.id)) });
  }));

  router.delete("/api/mailboxes/:id", (req, res) => {
    container.mailboxes.remove(currentUser(container, req), req.params.id);
    res.status(204).end();
  });

  router.post("/api/mailboxes/:id/test", asyncRoute(async (req, res) => {
    const user = currentUser(container, req);
    const mailbox = container.mailboxes.getOwned(user, req.params.id);
    const result = await container.mailboxes.testDraft(draftSchema.parse(req.body), mailbox);
    const failed = Boolean((result.imap && !result.imap.ok) || (result.smtp && !result.smtp.ok));
    res.status(failed ? 422 : 200).json(result);
  }));

  router.post("/api/mailboxes/:id/sync", (req, res) => {
    const mailbox = container.sync.enqueue(currentUser(container, req), req.params.id);
    if (mailbox.imap) container.indexer.nudge(mailbox.id);
    res.status(202).json({ mailbox: publicMailbox(mailbox, container.sync.progress(mailbox.id)) });
  });

  router.post("/api/mailboxes/:id/sync/stop", (req, res) => {
    const mailbox = container.sync.pause(currentUser(container, req), req.params.id);
    res.json({ mailbox: publicMailbox(mailbox, container.sync.progress(mailbox.id)) });
  });

  router.get("/api/mailboxes/:id/folders", (req, res) => {
    const user = currentUser(container, req);
    res.json({ folders: container.mail.folders(user, req.params.id) });
  });

  router.get("/api/messages", (req, res) => {
    const user = currentUser(container, req);
    const query = z.object({
      q: z.string().max(200).optional(),
      mailboxId: z.string().uuid().optional(),
      folder: z.string().max(400).optional(),
      since: z.string().max(40).optional(),
      until: z.string().max(40).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }).parse(req.query);
    try {
      const messages = container.mail.search({
        userId: user.id,
        text: query.q ? toFts(query.q) : undefined,
        mailboxId: query.mailboxId,
        folder: query.folder,
        since: query.since,
        until: query.until,
        limit: query.limit ?? 30,
      });
      res.json({ messages });
    } catch {
      throw new AppError("invalid_query", "Die Suche konnte nicht ausgeführt werden.", 400);
    }
  });

  router.get("/api/messages/:id", (req, res) => {
    res.json({ message: container.mail.getIndexed(currentUser(container, req), req.params.id) });
  });

  router.get("/api/messages/:id/body", asyncRoute(async (req, res) => {
    const message = await container.mail.read(currentUser(container, req), req.params.id);
    res.json({
      subject: message.subject,
      from: message.from,
      to: message.to,
      cc: message.cc,
      date: message.date,
      text: message.text.slice(0, 100_000),
      html: message.html ? message.html.slice(0, 200_000) : null,
      links: message.links,
      attachments: message.attachments,
    });
  }));

  router.get("/api/messages/:id/attachments/:part", asyncRoute(async (req, res) => {
    const file = await container.mail.readAttachment(currentUser(container, req), req.params.id, req.params.part);
    const bytes = Buffer.from(file.data);
    const ascii = file.filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
    res.setHeader("Content-Type", file.contentType || "application/octet-stream");
    res.setHeader("Content-Length", String(bytes.byteLength));
    res.setHeader("Content-Disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(bytes);
  }));

  router.post("/api/messages/send", asyncRoute(async (req, res) => {
    const body = sendSchema.parse(req.body);
    const sent = await container.mail.send(currentUser(container, req), {
      mailboxId: body.mailboxId,
      to: asList(body.to),
      cc: asList(body.cc),
      bcc: asList(body.bcc),
      subject: body.subject,
      text: body.text,
      html: body.html,
      fromName: body.fromName,
      attachments: body.attachments,
      saveToSent: body.saveToSent,
      flags: body.flags,
      priority: body.priority,
    });
    res.status(202).json(sent);
  }));
}

function auditCsv(events: ReturnType<Container["audit"]["export"]>): string {
  const head = ["seq", "zeit", "quelle", "kategorie", "aktion", "status", "agent", "token", "postfach", "ressource", "eingabe", "ausgabe", "fehler", "ip", "hash"];
  const cell = (value: unknown): string => {
    let text = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = events.map((event) =>
    [event.seq, event.ts, event.source, event.category, event.action, event.status, event.agentName, event.tokenName, event.mailboxEmail,
      event.resource, event.input, event.output, event.error, event.ip, event.hash].map(cell).join(","));
  return `\ufeff${[head.map(cell).join(","), ...rows].join("\r\n")}\r\n`;
}

function auditCategoryOf(method: string, path: string): AuditCategory {
  if (path.startsWith("/api/auth/")) return "auth";
  if (path === "/api/messages/send") return "send";
  if (path.endsWith("/sync") || path.endsWith("/sync/stop")) return "sync";
  if (method === "DELETE") return "delete";
  if (path.startsWith("/api/tokens") || path.startsWith("/api/invites") || path.startsWith("/api/mailboxes")) return method === "GET" ? "read" : "admin";
  return method === "GET" ? "read" : "write";
}

/** Protokolliert Aktionen über die Weboberfläche (Anmeldung, Postfächer, Tokens, Lesen, Versand). */
function auditWeb(container: Container) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const started = Date.now();
    const sendBody: { value: unknown } = { value: null };
    const full = req.originalUrl.split("?")[0] ?? "";
    const path = container.config.basePath && full.startsWith(container.config.basePath) ? full.slice(container.config.basePath.length) : full;
    if (req.method === "POST" && path === "/api/messages/send") {
      const original = res.json.bind(res);
      res.json = (body: unknown) => {
        sendBody.value = body;
        return original(body);
      };
    }
    const sessionUser = container.auth.userFromSession(readCookie(req.headers.cookie, COOKIE));
    const mailboxHint = typeof req.body?.mailboxId === "string" ? (req.body.mailboxId as string) : null;
    const needsMailboxes = Boolean(mailboxHint) || path.startsWith("/api/mailboxes/");
    const mailboxes = sessionUser && needsMailboxes ? container.mailboxes.list(sessionUser) : [];
    res.on("finish", () => {
      if (AUDIT_SKIP.has(`${req.method} ${path}`) || path.startsWith("/api/audit")) return;
      const actor = webActors.get(req) ?? sessionUser;
      const params = (req.params ?? {}) as Record<string, string>;
      const mailboxId = path.startsWith("/api/mailboxes/") && params.id ? params.id : mailboxHint;
      const resource: Record<string, unknown> = { ...params };
      if (path.startsWith("/api/messages/") && params.id && actor) {
        try {
          const message = container.mail.getIndexed(actor, params.id);
          resource.message = { id: message.id, folder: message.folder, uid: message.uid, from: message.from, subject: message.subject };
        } catch {
          // Nachricht nicht mehr im Index
        }
      }
      const status = res.statusCode < 400 ? "ok" : res.statusCode === 401 || res.statusCode === 403 ? "denied" : "error";
      const output: Record<string, unknown> = { httpStatus: res.statusCode };
      if (sendBody.value && typeof sendBody.value === "object") Object.assign(output, sendBody.value);
      container.audit.record({
        userId: actor?.id ?? null,
        source: "web",
        category: auditCategoryOf(req.method, path),
        action: `${req.method} ${typeof req.route?.path === "string" ? req.route.path : path}`,
        status,
        durationMs: Date.now() - started,
        mailboxId: mailboxId && mailboxes.some((mailbox) => mailbox.id === mailboxId) ? mailboxId : null,
        mailboxEmail: mailboxes.find((mailbox) => mailbox.id === mailboxId)?.email ?? null,
        resource,
        input: { ...(req.method === "GET" ? {} : { body: req.body ?? null }), query: req.query },
        output,
        error: status === "ok" ? null : String(res.locals.auditError ?? `HTTP ${res.statusCode}`),
        ip: req.ip ?? null,
        userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
      });
    });
    next();
  };
}

function mountSpa(router: express.Router, container: Container): void {
  const dist = resolve(container.config.webDist);
  if (!existsSync(dist)) return;
  const index = resolve(dist, "index.html");
  router.use(express.static(dist, { index: false, fallthrough: true }));
  router.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (req.path.startsWith("/api/") || req.path === "/mcp" || !existsSync(index)) {
      next();
      return;
    }
    res.sendFile(index);
  });
}

function authorizedCron(secret: string, header: string | undefined): boolean {
  const given = header ?? "";
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

function isTooLarge(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "type" in error && (error as { type?: string }).type === "entity.too.large");
}

function currentUser(container: Container, req: Request): PublicUser {
  const user = container.auth.userFromSession(readCookie(req.headers.cookie, COOKIE));
  if (!user) throw unauthorized();
  webActors.set(req, user);
  return user;
}

function publicMailbox(mailbox: Mailbox, progress: { messageTotal: number | null; folderTotal: number; folderDone: number }) {
  return {
    id: mailbox.id,
    displayName: mailbox.displayName,
    description: mailbox.description,
    instructions: mailbox.instructions,
    webhooks: mailbox.webhooks,
    webhookExcludedFolders: mailbox.webhookExcludedFolders ?? [],
    email: mailbox.email,
    providerId: mailbox.providerId,
    imap: mailbox.imap,
    smtp: mailbox.smtp,
    sentFolder: mailbox.sentFolder ?? "",
    serverStoresSent: mailbox.serverStoresSent ?? false,
    signatures: mailbox.signatures ?? [],
    indexStatus: mailbox.indexStatus,
    indexedCount: mailbox.indexedCount,
    messageTotal: progress.messageTotal,
    folderTotal: progress.folderTotal,
    folderDone: progress.folderDone,
    lastSyncAt: mailbox.lastSyncAt,
    lastError: mailbox.lastError,
    createdAt: mailbox.createdAt,
    updatedAt: mailbox.updatedAt,
  };
}

function asList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const source = Array.isArray(value) ? value : value.split(/[,;]/);
  return source.map((item) => item.trim()).filter(Boolean);
}

function toFts(query: string): string | undefined {
  const tokens = query.trim().split(/\s+/).filter(Boolean).slice(0, 12);
  if (tokens.length === 0) return undefined;
  return tokens.map((token) => `"${token.replace(/"/g, "")}"*`).join(" AND ");
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function setSession(res: Response, container: Container, token: string): void {
  const secure = container.config.secureCookies ? "; Secure" : "";
  const path = container.config.basePath || "/";
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=${path}; Max-Age=${14 * 86400}${secure}`);
}

function clearSession(res: Response, container: Container): void {
  const path = container.config.basePath || "/";
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=${path}; Max-Age=0`);
}

function limited(hits: Map<string, { count: number; reset: number }>, key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.reset < now) {
    hits.set(key, { count: 1, reset: now + 15 * 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 8;
}

function asyncRoute(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
