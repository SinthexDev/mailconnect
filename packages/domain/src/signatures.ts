import { AppError } from "./errors.js";
import type { MailSignature, SignatureKind } from "./types.js";

export const MAX_SIGNATURES = 50;
const MAX_TITLE = 120;
const MAX_BODY = 200_000;
const MAX_INSTRUCTIONS = 2000;

export type SignatureDraft = {
  id?: string;
  title: string;
  kind: string;
  body: string;
  instructions: string;
  isDefault: boolean;
};

export function upsertSignature(existing: readonly MailSignature[], draft: SignatureDraft, newId: string): MailSignature[] {
  const next = cleanSignature(draft, newId);
  const index = existing.findIndex((item) => item.id === next.id);
  if (index < 0 && existing.length >= MAX_SIGNATURES) {
    throw new AppError("too_many_signatures", "Höchstens 50 Signaturen pro Postfach.", 400);
  }
  const list = index < 0
    ? [...existing.map(copySignature), next]
    : existing.map((item, itemIndex) => itemIndex === index ? next : copySignature(item));
  const currentDefault = list.find((item) => item.isDefault)?.id;
  const defaultId = next.isDefault || !currentDefault ? next.id : currentDefault;
  return list.map((item) => ({ ...item, isDefault: item.id === defaultId }));
}

export function removeSignature(existing: readonly MailSignature[], id: string): MailSignature[] {
  const list = existing.filter((item) => item.id !== id).map(copySignature);
  if (list.length > 0 && !list.some((item) => item.isDefault)) list[0] = { ...list[0], isDefault: true };
  return list;
}

function cleanSignature(draft: SignatureDraft, newId: string): MailSignature {
  const title = oneLine(draft.title, MAX_TITLE, "Der Signaturtitel ist ungültig.");
  if (!title) throw new AppError("invalid_signature", "Der Signaturtitel fehlt.", 400);
  const kind = signatureKind(draft.kind);
  const body = bounded(draft.body, MAX_BODY, "Die Signatur ist zu lang.");
  const instructions = bounded(draft.instructions, MAX_INSTRUCTIONS, "Die Handlungsanweisungen der Signatur sind zu lang.");
  const id = draft.id?.trim() || newId;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("invalid_signature", "Die Signatur-ID ist ungültig.", 400);
  return { id, title, kind, body, instructions, isDefault: draft.isDefault };
}

function signatureKind(value: string): SignatureKind {
  if (value === "plain" || value === "html") return value;
  throw new AppError("invalid_signature", "Der Signaturtyp muss plain oder html sein.", 400);
}

function oneLine(value: string, max: number, message: string): string {
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length > max) throw new AppError("invalid_signature", message, 400);
  return text;
}

function bounded(value: string, max: number, message: string): string {
  const text = value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
  if (text.length > max) throw new AppError("invalid_signature", message, 400);
  return text;
}

function copySignature(item: MailSignature): MailSignature {
  return { ...item };
}
