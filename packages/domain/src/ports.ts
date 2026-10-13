import type {
  ApiToken,
  ChannelSettings,
  CredentialKind,
  EncryptedBlob,
  FolderCursor,
  FolderPull,
  IndexProgress,
  AttachmentFile,
  FullMessage,
  PullBatch,
  IndexedMessage,
  Invite,
  Mailbox,
  OutboundMail,
  ProviderPreset,
  SearchQuery,
  User,
} from "./types.js";

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  newId(): string;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
}

export interface SecretHasher {
  hash(purpose: "session" | "invite" | "api", secret: string): string;
  newSecret(): string;
}

export interface CredentialVault {
  encrypt(plaintext: string): EncryptedBlob;
  decrypt(blob: EncryptedBlob): string;
}

export interface UserRepository {
  count(): number;
  insert(user: User): void;
  findByEmail(email: string): User | null;
  findById(id: string): User | null;
  updatePassword(id: string, passwordHash: string): void;
}

export interface InviteRepository {
  insert(invite: Invite, tokenHash: string): void;
  findByTokenHash(tokenHash: string): Invite | null;
  markUsed(id: string, usedAt: string, usedBy: string): void;
  listByCreator(userId: string): Invite[];
}

export interface SessionRepository {
  insert(id: string, userId: string, tokenHash: string, expiresAt: string, createdAt: string): void;
  findUserId(tokenHash: string): string | null;
  deleteByTokenHash(tokenHash: string): void;
  deleteExpired(now: string): void;
}

export interface ApiTokenRepository {
  insert(token: ApiToken, tokenHash: string): void;
  listByUser(userId: string): ApiToken[];
  findUserIdByHash(tokenHash: string): string | null;
  touch(tokenHash: string, at: string): void;
  revoke(id: string, userId: string, at: string): boolean;
}

export interface MailboxRepository {
  insert(mailbox: Mailbox): void;
  update(mailbox: Mailbox): void;
  delete(id: string, userId: string): boolean;
  findById(id: string): Mailbox | null;
  listByUser(userId: string): Mailbox[];
  listIndexable(now: string): Mailbox[];
  setSyncState(
    id: string,
    patch: Pick<Mailbox, "indexStatus" | "indexedCount" | "lastSyncAt" | "lastError" | "errorStreak" | "retryAt" | "updatedAt">,
  ): void;
}

export interface CredentialRepository {
  upsert(mailboxId: string, kind: CredentialKind, blob: EncryptedBlob): void;
  get(mailboxId: string, kind: CredentialKind): EncryptedBlob | null;
  delete(mailboxId: string, kind: CredentialKind): void;
}

export interface MessageIndexRepository {
  listCursors(mailboxId: string): FolderCursor[];
  applyFolderPull(mailboxId: string, pull: FolderPull, syncedAt: string): void;
  count(mailboxId: string): number;
  progress(mailboxId: string): IndexProgress;
  search(query: SearchQuery): IndexedMessage[];
  findById(id: string, userId: string): IndexedMessage | null;
  listFolders(mailboxId: string, userId: string): FolderCursor[];
  stats(userId: string): {
    mailboxCount: number;
    imapCount: number;
    smtpOnlyCount: number;
    indexedMessages: number;
    syncing: number;
    errors: number;
    lastSyncAt: string | null;
  };
  deleteMailboxData(mailboxId: string): void;
}

export type ImapSettings = ChannelSettings & { password: string };
export type SmtpSettings = ChannelSettings & { password: string };

export interface ImapPort {
  test(settings: ImapSettings): Promise<void>;
  pull(settings: ImapSettings, cursors: FolderCursor[], limit: number, onProgress?: (pull: FolderPull) => void): Promise<PullBatch>;
  fetchMessage(settings: ImapSettings, folder: string, uid: number): Promise<FullMessage>;
  fetchAttachment(settings: ImapSettings, folder: string, uid: number, attachmentId: string): Promise<AttachmentFile>;
}

export interface SmtpPort {
  test(settings: SmtpSettings): Promise<void>;
  send(settings: SmtpSettings, message: OutboundMail): Promise<void>;
}

export interface ProviderCatalog {
  list(): ProviderPreset[];
  find(id: string): ProviderPreset | null;
}
