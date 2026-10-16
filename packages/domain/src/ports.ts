import type {
  ApiToken,
  ChannelSettings,
  CredentialKind,
  EncryptedBlob,
  FlagMode,
  FolderCursor,
  FolderPull,
  ImapFolderInfo,
  ImapFolderStatus,
  ImapSearchCriteria,
  IndexProgress,
  AttachmentFile,
  FullMessage,
  PullBatch,
  IndexedMessage,
  StoredAppend,
  StoredFlag,
  UidRelocation,
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
  setIndexedCount(id: string, indexedCount: number, updatedAt: string): void;
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
  findInFolder(mailboxId: string, folder: string, uids: number[]): IndexedMessage[];
  applyDeletion(mailboxId: string, folder: string, uids: number[]): number;
  applyMove(mailboxId: string, source: string, destination: string, moves: UidRelocation[], at: string): number;
  applyCopy(mailboxId: string, source: string, destination: string, moves: UidRelocation[], at: string): number;
  applyFlags(mailboxId: string, folder: string, updates: StoredFlag[]): void;
  applyAppend(mailboxId: string, message: StoredAppend, at: string): number;
  rewriteFolders(mailboxId: string, from: string, to: string, delimiter: string): void;
  removeFolder(mailboxId: string, folder: string): number;
  ensureFolder(mailboxId: string, folder: string, at: string): void;
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
  listRemoteFolders(settings: ImapSettings): Promise<ImapFolderInfo[]>;
  folderStatus(settings: ImapSettings, folder: string): Promise<ImapFolderStatus>;
  createFolder(settings: ImapSettings, folder: string): Promise<{ path: string; created: boolean }>;
  renameFolder(settings: ImapSettings, folder: string, newFolder: string): Promise<{ path: string; newPath: string; delimiter: string }>;
  deleteFolder(settings: ImapSettings, folder: string): Promise<void>;
  setSubscription(settings: ImapSettings, folder: string, subscribed: boolean): Promise<void>;
  deleteMessages(settings: ImapSettings, folder: string, uids: number[]): Promise<void>;
  moveMessages(settings: ImapSettings, folder: string, uids: number[], destination: string): Promise<UidRelocation[]>;
  copyMessages(settings: ImapSettings, folder: string, uids: number[], destination: string): Promise<UidRelocation[]>;
  storeFlags(settings: ImapSettings, folder: string, uids: number[], mode: FlagMode, flags: string[]): Promise<StoredFlag[]>;
  appendMessage(settings: ImapSettings, folder: string, rfc822: string, flags: string[]): Promise<{ uid: number | null }>;
  searchUids(settings: ImapSettings, folder: string, criteria: ImapSearchCriteria): Promise<number[]>;
}

export interface SmtpPort {
  test(settings: SmtpSettings): Promise<void>;
  send(settings: SmtpSettings, message: OutboundMail): Promise<void>;
}

export interface ProviderCatalog {
  list(): ProviderPreset[];
  find(id: string): ProviderPreset | null;
}
