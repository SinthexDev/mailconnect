import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { AppError, unauthorized, type Mailbox, type PublicUser } from "@mailconnect/domain";
import type { Container } from "./container.js";
import { mountMcp } from "./mcp.js";

const COOKIE = "mc_session";

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
  email: z.string().trim().min(3).max(320),
  providerId: z.string().max(80).nullable().optional().default(null),
  imap: channelSchema.nullable().optional().default(null),
  smtp: channelSchema.nullable().optional().default(null),
});

const sendSchema = z.object({
  mailboxId: z.string().uuid(),
  to: z.union([z.string(), z.array(z.string())]),
  cc: z.union([z.string(), z.array(z.string())]).optional(),
  bcc: z.union([z.string(), z.array(z.string())]).optional(),
  subject: z.string().max(998).default(""),
  text: z.string().max(1_000_000).default(""),
  html: z.string().max(1_000_000).optional(),
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
  router.use(express.json({ limit: "1mb" }));
  mountMcp(router, container);
  mountApi(router, container);
  mountSpa(router, container);
  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof AppError) {
      res.status(error.status).json({ error: error.code, message: error.message });
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

  router.post("/api/auth/login", asyncRoute(async (req, res) => {
    const body = z.object({ email: z.string().max(320), password: z.string().max(2000) }).parse(req.body);
    const key = body.email.trim().toLowerCase();
    if (limited(loginHits, key)) throw new AppError("rate_limited", "Zu viele Versuche. Bitte später erneut versuchen.", 429);
    const result = await container.auth.login(body.email, body.password);
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
    setSession(res, container, result.token);
    res.status(201).json({ user: result.user });
  }));

  router.post("/api/auth/change-password", asyncRoute(async (req, res) => {
    const user = currentUser(container, req);
    const body = z.object({ currentPassword: z.string().max(2000), newPassword: z.string().max(2000) }).parse(req.body);
    await container.auth.changePassword(user.id, body.currentPassword, body.newPassword);
    res.status(204).end();
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
    await container.mail.send(currentUser(container, req), {
      mailboxId: body.mailboxId,
      to: asList(body.to),
      cc: asList(body.cc),
      bcc: asList(body.bcc),
      subject: body.subject,
      text: body.text,
      html: body.html,
    });
    res.status(202).json({ ok: true });
  }));
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

function currentUser(container: Container, req: Request): PublicUser {
  const user = container.auth.userFromSession(readCookie(req.headers.cookie, COOKIE));
  if (!user) throw unauthorized();
  return user;
}

function publicMailbox(mailbox: Mailbox, progress: { messageTotal: number | null; folderTotal: number; folderDone: number }) {
  return {
    id: mailbox.id,
    displayName: mailbox.displayName,
    description: mailbox.description,
    instructions: mailbox.instructions,
    email: mailbox.email,
    providerId: mailbox.providerId,
    imap: mailbox.imap,
    smtp: mailbox.smtp,
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
