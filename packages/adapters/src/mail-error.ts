import { AppError } from "@mailconnect/domain";

type MailFailure = {
  message?: unknown;
  responseText?: unknown;
  response?: unknown;
  code?: unknown;
  authenticationFailed?: unknown;
};

export function missingMailbox(error: unknown): boolean {
  const extra = error && typeof error === "object" ? (error as MailFailure) : {};
  const responseText = typeof extra.responseText === "string" ? extra.responseText : "";
  const response = typeof extra.response === "string" ? extra.response : "";
  const message = error instanceof Error ? error.message : typeof extra.message === "string" ? extra.message : "";
  return /mailbox does not exist/i.test(`${responseText} ${response} ${message}`);
}

export function connectionError(label: "IMAP" | "SMTP", error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && error.message === "paused") throw error;
  const extra: MailFailure = error && typeof error === "object" ? error : {};
  const responseText = typeof extra.responseText === "string" ? extra.responseText : "";
  const response = typeof extra.response === "string" ? extra.response : "";
  const message = error instanceof Error ? error.message : typeof extra.message === "string" ? extra.message : "";
  const combined = `${responseText} ${response} ${message}`;
  const auth = extra.authenticationFailed === true || extra.code === "EAUTH" || /authenticat|invalid login|\b535\b|\b534\b/i.test(combined);
  if (auth) {
    return new AppError("mailbox_auth", `${label}: Der Server hat Benutzername oder Passwort abgelehnt.`, 400);
  }
  if (extra.code === "ETIMEOUT" || /socket timeout|connection not available|econnreset|etimedout/i.test(combined)) {
    return new AppError("mailbox_timeout", `${label}: Die Verbindung ist abgebrochen. Der Abgleich versucht es erneut.`, 400);
  }
  const text = (responseText || response || message || "Verbindung fehlgeschlagen").replace(/\s+/g, " ").slice(0, 180);
  return new AppError("mailbox_connect", `${label}: ${text}`, 400);
}
