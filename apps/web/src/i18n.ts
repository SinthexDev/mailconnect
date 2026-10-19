import { de, en, type Messages } from './messages';

export type Lang = 'de' | 'en';

const KEY = 'mailconnect.lang';
const catalogs: Record<Lang, Messages> = { de, en };
const listeners = new Set<() => void>();
let lang: Lang = 'de';

const enNotes: Record<string, string> = {
  gmx: 'The username is the full email address. With 2FA enabled, use an app password.',
  webde: 'The username is the full email address.',
  ionos: 'Formerly 1&1. The username is the full email address.',
  tonline: 'The username is the full T-Online address.',
  strato: 'The username is the full email address.',
  freenet: 'The username is the full email address.',
  posteo: 'Posteo password. The username is the full address.',
  mailboxorg: 'The username is the full email address.',
  allinkl: 'The host is in KAS, often wXXXXX.kasserver.com. Replace the placeholder hosts before saving.',
  hetzner: 'Typically mail.your-server.de. Check the host in konsoleH.',
  df: 'Enter the host from the customer menu, often sslin.df.eu.',
  netcup: 'The host depends on the server, for example mxeXXX.netcup.net.',
  'proton-bridge': 'Reachable only when Proton Bridge runs on the same machine as MailConnect. Unsuitable for a remote server.',
  gmail: 'Enable IMAP in Gmail and use an app password. The normal account password does not work.',
  outlook: 'Microsoft accounts often need an app password. OAuth is not built into this version.',
  yahoo: 'Use an app password.',
  icloud: 'Use an app-specific password from appleid.apple.com. The username is the Apple ID.',
  aol: 'Use an app password.',
  ovh: 'Depending on the plan, ssl0.ovh.net. The username is the full address.',
  'zoho-eu': 'An app password is recommended. European servers.',
  fastmail: 'Use an app password.',
  'mailboxorg-smtp': 'Preset for SMTP only. Leave IMAP empty if you only want to send.',
  custom: 'Enter host, port, and TLS yourself. IMAP, SMTP, or both.',
};

const enErrors: Record<string, string> = {
  rate_limited: 'Too many attempts. Please try again later.',
  invalid_query: 'The search could not be run.',
  invalid_email: 'The email address is invalid.',
  already_bootstrapped: 'A user already exists.',
  invalid_login: 'Email or password is wrong.',
  invalid_password: 'The current password is wrong.',
  forbidden: 'You do not have permission.',
  invalid_invite: 'The invitation is invalid.',
  invite_expired: 'The invitation has expired.',
  invite_email: 'This invitation is for a different email address.',
  email_taken: 'An account already exists for this email.',
  no_imap: 'This account has no IMAP.',
  no_smtp: 'This account has no SMTP.',
  missing_secret: 'The credentials are missing.',
  missing_recipient: 'At least one recipient is required.',
  too_many_recipients: 'Too many recipients.',
  invalid_name: 'The name is invalid or too long.',
  from_name_too_long: 'The sender name is longer than 100 characters.',
  not_found: 'Not found.',
  unauthorized: 'Sign-in required.',
  invalid_channel: 'Host and username are required.',
  invalid_port: 'The port is invalid.',
  missing_password: 'A password is required.',
  empty_mailbox: 'IMAP or SMTP must be set.',
  invalid_description: 'The description is too long.',
  invalid_instructions: 'The instructions are too long.',
  invalid_webhook: 'A webhook address must be a public https URL.',
  too_many_webhooks: 'At most 5 webhook addresses.',
  invalid_webhook_folder: 'A folder name is invalid.',
  too_many_webhook_folders: 'At most 200 excluded folders.',
  invalid_signature: 'The signature is invalid.',
  too_many_signatures: 'At most 50 signatures per mailbox.',
  validation: 'Invalid input.',
  internal: 'Internal error.',
  mailbox_auth: 'The server rejected the username or password.',
  error: 'The request failed.',
  unknown: 'Unknown error.',
};

function readInitial(): Lang {
  if (typeof window === 'undefined') return 'de';
  const query = new URLSearchParams(window.location.search).get('lang');
  if (query === 'de' || query === 'en') return query;
  const stored = localStorage.getItem(KEY);
  if (stored === 'de' || stored === 'en') return stored;
  return 'de';
}

lang = readInitial();
if (typeof document !== 'undefined') {
  document.documentElement.lang = lang;
  localStorage.setItem(KEY, lang);
}

export function getLang(): Lang {
  return lang;
}

export function subscribeLang(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLang(next: Lang): void {
  lang = next;
  localStorage.setItem(KEY, next);
  document.documentElement.lang = next;
  const url = new URL(window.location.href);
  if (url.searchParams.has('lang')) {
    url.searchParams.set('lang', next);
    window.history.replaceState(window.history.state, '', url);
  }
  listeners.forEach((listener) => listener());
}

export function messages(): Messages {
  return catalogs[lang];
}

export function providerNote(id: string, note: string | undefined): string | undefined {
  if (!note) return undefined;
  if (lang === 'de') return note;
  return enNotes[id] ?? note;
}

export function localizeError(code: string, message: string): string {
  if (lang === 'de') return message || 'Unbekannter Fehler';
  const exact: Record<string, string> = {
    'Für ein neues Protokoll braucht es ein Passwort.': 'A new protocol needs a password.',
    'IMAP-Passwort fehlt.': 'The IMAP password is missing.',
    'SMTP-Passwort fehlt. Leer lassen übernimmt das IMAP-Passwort.': 'The SMTP password is missing. Leave it empty to use the IMAP password.',
    'Nur Admins können Einladungen erstellen.': 'Only admins can create invitations.',
    'Nur Admins können Einladungen sehen.': 'Only admins can view invitations.',
    'Der Token-Name braucht 1 bis 80 Zeichen.': 'The token name needs 1 to 80 characters.',
    'Token nicht gefunden.': 'Token not found.',
    'Nicht gefunden.': 'Not found.',
    'Keine Berechtigung.': 'You do not have permission.',
    'Anmeldung erforderlich.': 'Sign-in required.',
    'Interner Fehler.': 'Internal error.',
    'IMAP: Die Verbindung ist abgebrochen. Der Abgleich versucht es erneut.': 'IMAP: The connection dropped. Sync will try again.',
    'IMAP: Die Nachrichtensuche hat kein verwertbares Ergebnis geliefert.': 'IMAP: The message search returned nothing usable.',
    'Diesen Anhang gibt es an der Nachricht nicht.': 'This message has no such attachment.',
    'Der Anhang ist größer als 15 MB und wird nicht geladen.': 'The attachment is larger than 15 MB and is not downloaded.',
    'Höchstens 10 Anhänge.': 'At most 10 attachments.',
    'Der Dateiname des Anhangs ist leer.': 'The attachment filename is empty.',
    'Der Anhang ist kein gültiges Base64.': 'The attachment is not valid Base64.',
    'Die Anhänge sind zusammen größer als 20 MB.': 'The attachments together are larger than 20 MB.',
    'Höchstens 5 Webhook-Adressen.': 'At most 5 webhook addresses.',
    'Der Signaturtitel fehlt.': 'The signature title is missing.',
    'Der Signaturtitel ist ungültig.': 'The signature title is invalid.',
    'Der Signaturtyp muss plain oder html sein.': 'The signature type must be plain or html.',
    'Die Signatur ist zu lang.': 'The signature is too long.',
    'Die Handlungsanweisungen der Signatur sind zu lang.': 'The signature instructions are too long.',
    'Die Signatur-ID ist ungültig.': 'The signature id is invalid.',
    'Höchstens 50 Signaturen pro Postfach.': 'At most 50 signatures per mailbox.',
    'Signatur nicht gefunden.': 'Signature not found.',
    'Die Webhook-Adresse ist ungültig.': 'The webhook address is invalid.',
    'Eine Webhook-Adresse muss mit https:// beginnen.': 'A webhook address must start with https://.',
    'Die Webhook-Adresse muss öffentlich erreichbar sein.': 'The webhook address must be publicly reachable.',
    'Die Webhook-Methode muss POST, PUT oder PATCH sein.': 'The webhook method must be POST, PUT, or PATCH.',
    'Der Webhook-Header ist zu lang.': 'The webhook header is too long.',
    'Der Webhook-Header muss aus Name und Wert bestehen, zum Beispiel Authorization: Bearer ….': 'The webhook header must be a name and a value, for example Authorization: Bearer ….',
    'Diesen Webhook-Header kann MailConnect nicht setzen.': 'MailConnect cannot set this webhook header.',
    'Der Webhook-Schlüssel ist ungültig.': 'The webhook key is invalid.',
    'Ein Ordnername ist ungültig.': 'A folder name is invalid.',
    'Höchstens 200 ausgeschlossene Ordner.': 'At most 200 excluded folders.',
    'Der Absendername ist länger als 100 Zeichen.': 'The sender name is longer than 100 characters.',
    'Die Anfrage ist zu groß. Anhänge dürfen zusammen 20 MB nicht überschreiten.': 'The request is too large. Attachments together may not exceed 20 MB.',
    'SMTP: Die Verbindung ist abgebrochen. Der Abgleich versucht es erneut.': 'SMTP: The connection dropped. Sync will try again.',
    'Ungültige Eingabe.': 'Invalid input.',
    'Unbekannter Fehler': 'Unknown error.',
  };
  if (exact[message]) return exact[message];
  const weak = /^Das Passwort braucht mindestens (\d+) Zeichen\.$/.exec(message);
  if (weak) return `The password needs at least ${weak[1]} characters.`;
  const auth = /^(IMAP|SMTP): Der Server hat Benutzername oder Passwort abgelehnt\.$/.exec(message);
  if (auth) return `${auth[1]}: The server rejected the username or password.`;
  const failed = /^(IMAP|SMTP): Verbindung fehlgeschlagen$/.exec(message);
  if (failed) return `${failed[1]}: Connection failed.`;
  const connect = /^(IMAP|SMTP): (.+)$/.exec(message);
  if (code === 'mailbox_connect' && connect) return `${connect[1]}: ${connect[2]}`;
  if (code === 'mailbox_auth' && connect) return `${connect[1]}: ${enErrors.mailbox_auth}`;
  if (message.startsWith('Anfrage fehlgeschlagen')) return message.replace('Anfrage fehlgeschlagen', 'Request failed');
  return enErrors[code] ?? message;
}

export function localizeStored(message: string): string {
  return localizeError('', message);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return catalogs[lang].never;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(lang === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}
