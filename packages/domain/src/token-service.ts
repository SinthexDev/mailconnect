import { AppError } from "./errors.js";
import type { ApiTokenRepository, Clock, IdGenerator, SecretHasher, UserRepository } from "./ports.js";
import type { ApiToken, PublicUser } from "./types.js";
import { toPublicUser } from "./auth-service.js";

export class TokenService {
  constructor(
    private readonly tokens: ApiTokenRepository,
    private readonly users: UserRepository,
    private readonly secrets: SecretHasher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  create(user: PublicUser, name: string): { token: ApiToken; secret: string } {
    const label = name.trim();
    if (label.length < 1 || label.length > 80) {
      throw new AppError("invalid_name", "Der Token-Name braucht 1 bis 80 Zeichen.", 400);
    }
    const secret = this.secrets.newSecret();
    const token: ApiToken = {
      id: this.ids.newId(),
      userId: user.id,
      name: label,
      createdAt: this.clock.now(),
      revokedAt: null,
      lastUsedAt: null,
    };
    this.tokens.insert(token, this.secrets.hash("api", secret));
    return { token, secret };
  }

  list(user: PublicUser): ApiToken[] {
    return this.tokens.listByUser(user.id);
  }

  revoke(user: PublicUser, id: string): void {
    const ok = this.tokens.revoke(id, user.id, this.clock.now());
    if (!ok) throw new AppError("not_found", "Token nicht gefunden.", 404);
  }

  authenticate(bearer: string | undefined): PublicUser | null {
    if (!bearer) return null;
    const tokenHash = this.secrets.hash("api", bearer);
    const userId = this.tokens.findUserIdByHash(tokenHash);
    if (!userId) return null;
    this.tokens.touch(tokenHash, this.clock.now());
    const user = this.users.findById(userId);
    return user ? toPublicUser(user) : null;
  }

  /** Wie authenticate, liefert aber zusätzlich den Token, damit Aktionen ihm zugeordnet werden können. */
  authenticateToken(bearer: string | undefined): { user: PublicUser; token: { id: string; name: string } } | null {
    if (!bearer) return null;
    const tokenHash = this.secrets.hash("api", bearer);
    const found = this.tokens.findByHash(tokenHash);
    if (!found) return null;
    const user = this.users.findById(found.userId);
    if (!user) return null;
    this.tokens.touch(tokenHash, this.clock.now());
    return { user: toPublicUser(user), token: { id: found.id, name: found.name } };
  }
}
