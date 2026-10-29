import { AppError, unauthorized } from "./errors.js";
import type {
  Clock,
  IdGenerator,
  InviteRepository,
  PasswordHasher,
  SecretHasher,
  SessionRepository,
  UserRepository,
} from "./ports.js";
import type { Invite, PublicUser, User } from "./types.js";
import { normalizeLogin, normalizeUsername } from "./username.js";

const SESSION_DAYS = 14;
const MIN_PASSWORD = 12;

export type CreatedInvite = Invite & { token: string };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertPassword(password: string): void {
  if (password.length < MIN_PASSWORD) {
    throw new AppError("weak_password", `Das Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.`, 400);
  }
}

function assertEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 320) {
    throw new AppError("invalid_email", "Die E-Mail-Adresse ist ungültig.", 400);
  }
  return normalized;
}

export function toPublicUser(user: Pick<User, "id" | "email" | "username" | "role">): PublicUser {
  return { id: user.id, email: user.email, username: user.username, role: user.role };
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly invites: InviteRepository,
    private readonly sessions: SessionRepository,
    private readonly passwords: PasswordHasher,
    private readonly secrets: SecretHasher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async bootstrapAdmin(email: string, password: string): Promise<PublicUser> {
    if (this.users.count() > 0) {
      throw new AppError("already_bootstrapped", "Es existiert bereits ein Benutzer.", 409);
    }
    assertPassword(password);
    const user = {
      id: this.ids.newId(),
      email: assertEmail(email),
      username: null as string | null,
      passwordHash: await this.passwords.hash(password),
      role: "admin" as const,
      createdAt: this.clock.now(),
    };
    this.users.insert(user);
    return toPublicUser(user);
  }

  async login(login: string, password: string): Promise<{ token: string; user: PublicUser }> {
    const parsed = normalizeLogin(login);
    const user = parsed.kind === "email"
      ? this.users.findByEmail(parsed.value)
      : this.users.findByUsername(parsed.value);
    const valid = await this.passwords.verify(password, user?.passwordHash ?? "not-a-hash");
    if (!user || !valid) {
      throw new AppError("invalid_login", "Anmeldung oder Passwort ist falsch.", 401);
    }
    return { token: this.openSession(user.id), user: toPublicUser(user) };
  }

  updateUsername(userId: string, username: string | null | undefined): PublicUser {
    const user = this.users.findById(userId);
    if (!user) throw unauthorized();
    const next = normalizeUsername(username);
    if (next) {
      const taken = this.users.findByUsername(next);
      if (taken && taken.id !== userId) {
        throw new AppError("username_taken", "Dieser Benutzername ist schon vergeben.", 409);
      }
    }
    this.users.updateUsername(userId, next);
    return toPublicUser({ ...user, username: next });
  }

  logout(sessionToken: string): void {
    this.sessions.deleteByTokenHash(this.secrets.hash("session", sessionToken));
  }

  userFromSession(sessionToken: string | undefined): PublicUser | null {
    if (!sessionToken) return null;
    this.sessions.deleteExpired(this.clock.now());
    const userId = this.sessions.findUserId(this.secrets.hash("session", sessionToken));
    if (!userId) return null;
    const user = this.users.findById(userId);
    return user ? toPublicUser(user) : null;
  }

  requireUser(sessionToken: string | undefined): PublicUser {
    const user = this.userFromSession(sessionToken);
    if (!user) throw unauthorized();
    return user;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = this.users.findById(userId);
    if (!user) throw unauthorized();
    const valid = await this.passwords.verify(currentPassword, user.passwordHash);
    if (!valid) throw new AppError("invalid_password", "Das aktuelle Passwort ist falsch.", 401);
    assertPassword(newPassword);
    this.users.updatePassword(userId, await this.passwords.hash(newPassword));
  }

  createInvite(admin: PublicUser, email: string | null, ttlHours: number): CreatedInvite {
    if (admin.role !== "admin") {
      throw new AppError("forbidden", "Nur Admins können Einladungen erstellen.", 403);
    }
    const hours = Number.isFinite(ttlHours) ? Math.min(24 * 30, Math.max(1, Math.floor(ttlHours))) : 72;
    const token = this.secrets.newSecret();
    const now = new Date(this.clock.now());
    const invite: Invite = {
      id: this.ids.newId(),
      email: email ? assertEmail(email) : null,
      createdBy: admin.id,
      expiresAt: new Date(now.getTime() + hours * 3600_000).toISOString(),
      usedAt: null,
      usedBy: null,
      createdAt: now.toISOString(),
    };
    this.invites.insert(invite, this.secrets.hash("invite", token));
    return { ...invite, token };
  }

  listInvites(admin: PublicUser): Invite[] {
    if (admin.role !== "admin") {
      throw new AppError("forbidden", "Nur Admins können Einladungen sehen.", 403);
    }
    return this.invites.listByCreator(admin.id);
  }

  async acceptInvite(token: string, email: string, password: string): Promise<{ token: string; user: PublicUser }> {
    const invite = this.invites.findByTokenHash(this.secrets.hash("invite", token));
    if (!invite || invite.usedAt) {
      throw new AppError("invalid_invite", "Die Einladung ist ungültig.", 400);
    }
    if (invite.expiresAt < this.clock.now()) {
      throw new AppError("invite_expired", "Die Einladung ist abgelaufen.", 400);
    }
    const normalized = assertEmail(email);
    if (invite.email && invite.email !== normalized) {
      throw new AppError("invite_email", "Diese Einladung gilt für eine andere E-Mail-Adresse.", 400);
    }
    if (this.users.findByEmail(normalized)) {
      throw new AppError("email_taken", "Für diese E-Mail existiert bereits ein Konto.", 409);
    }
    assertPassword(password);
    const user = {
      id: this.ids.newId(),
      email: normalized,
      username: null as string | null,
      passwordHash: await this.passwords.hash(password),
      role: "user" as const,
      createdAt: this.clock.now(),
    };
    this.users.insert(user);
    this.invites.markUsed(invite.id, this.clock.now(), user.id);
    return { token: this.openSession(user.id), user: toPublicUser(user) };
  }

  private openSession(userId: string): string {
    const token = this.secrets.newSecret();
    const now = new Date(this.clock.now());
    this.sessions.insert(
      this.ids.newId(),
      userId,
      this.secrets.hash("session", token),
      new Date(now.getTime() + SESSION_DAYS * 86400_000).toISOString(),
      now.toISOString(),
    );
    return token;
  }
}
