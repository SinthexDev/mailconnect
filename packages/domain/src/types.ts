export type Role = "admin" | "user";

export type IndexStatus = "idle" | "syncing" | "paused" | "error" | "disabled";

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
};

export type PublicUser = {
  id: string;
  email: string;
  role: Role;
};

export type Invite = {
  id: string;
  email: string | null;
  createdBy: string;
  expiresAt: string;
  usedAt: string | null;
  usedBy: string | null;
  createdAt: string;
};

export type ApiToken = {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
};

export type ChannelSettings = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
};

export type ChannelInput = ChannelSettings & {
  password?: string;
};

export type Mailbox = {
  id: string;
  userId: string;
  displayName: string;
  description: string;
  instructions: string;
  email: string;
  providerId: string | null;
  imap: ChannelSettings | null;
  smtp: ChannelSettings | null;
  indexStatus: IndexStatus;
  indexedCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  errorStreak: number;
  retryAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EncryptedBlob = {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
};

export type CredentialKind = "imap" | "smtp";

export type FolderCursor = {
  mailboxId: string;
  folder: string;
  uidValidity: number | null;
  lastUid: number;
  indexedCount: number;
  lastSyncAt: string | null;
  status: IndexStatus;
  lastError: string | null;
};

export type IndexedMessage = {
  id: string;
  mailboxId: string;
  folder: string;
  uid: number;
  messageId: string | null;
  threadId: string | null;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string | null;
  flags: string[];
  hasAttachments: boolean;
  snippet: string;
};

export type RemoteMessage = {
  uid: number;
  messageId: string | null;
  threadId: string | null;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string | null;
  flags: string[];
  hasAttachments: boolean;
  snippet: string;
  bodyHash: string | null;
};

export type FolderPull = {
  folder: string;
  uidValidity: number;
  reset: boolean;
  messages: RemoteMessage[];
  caughtUp: boolean;
  highestUid: number;
  remoteCount: number;
};

export type IndexProgress = {
  messageTotal: number | null;
  folderTotal: number;
  folderDone: number;
};

export type PullBatch = {
  folders: FolderPull[];
  caughtUp: boolean;
};

export type MailAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number | null;
};

export type MailLink = {
  href: string;
  text: string;
};

export type FullMessage = {
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string | null;
  text: string;
  html: string | null;
  links: MailLink[];
  attachments: MailAttachment[];
};

export type AttachmentFile = MailAttachment & {
  data: Uint8Array;
};

export type OutboundMail = {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  html?: string;
};

export type ProviderPreset = {
  id: string;
  name: string;
  region: string;
  note?: string;
  imap?: { host: string; port: number; secure: boolean };
  smtp?: { host: string; port: number; secure: boolean };
};

export type FlagMode = "set" | "add" | "remove";

export type ImapFolderInfo = {
  path: string;
  name: string;
  delimiter: string;
  parentPath: string;
  flags: string[];
  specialUse: string | null;
  selectable: boolean;
  subscribed: boolean;
};

export type ImapFolderStatus = {
  path: string;
  messages: number;
  recent: number;
  unseen: number;
  uidNext: number;
  uidValidity: number;
};

export type UidRelocation = {
  uid: number;
  destinationUid: number | null;
};

export type StoredFlag = {
  uid: number;
  flags: string[];
};

export type StoredAppend = {
  folder: string;
  uid: number;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string | null;
  flags: string[];
  snippet: string;
};

export type ImapSearchCriteria = {
  seen?: boolean;
  flagged?: boolean;
  answered?: boolean;
  draft?: boolean;
  deleted?: boolean;
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  text?: string;
  since?: string;
  before?: string;
  keyword?: string;
};

export type SearchQuery = {
  userId: string;
  text?: string;
  mailboxId?: string;
  folder?: string;
  flag?: string;
  since?: string;
  until?: string;
  limit: number;
};

export type IndexStats = {
  mailboxCount: number;
  imapCount: number;
  smtpOnlyCount: number;
  indexedMessages: number;
  syncing: number;
  errors: number;
  lastSyncAt: string | null;
};

export type ChannelTestResult = {
  ok: boolean;
  error?: string;
};

export type ConnectionTestResult = {
  imap?: ChannelTestResult;
  smtp?: ChannelTestResult;
};
