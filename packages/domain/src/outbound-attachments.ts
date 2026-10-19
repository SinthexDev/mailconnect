import { AppError } from "./errors.js";
import type { PreparedAttachment } from "./types.js";

export const MAX_OUTBOUND_ATTACHMENTS = 10;
export const MAX_OUTBOUND_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export type InboundAttachment = {
  filename: string;
  contentType?: string;
  contentBase64: string;
  contentId?: string;
};

export function prepareOutboundAttachments(items: InboundAttachment[] | undefined): PreparedAttachment[] {
  const list = items ?? [];
  if (list.length > MAX_OUTBOUND_ATTACHMENTS) {
    throw new AppError("too_many_attachments", "Höchstens 10 Anhänge.", 400);
  }
  let total = 0;
  return list.map((item) => {
    const filename = sanitizeOutboundFilename(item.filename);
    if (!filename) throw new AppError("bad_attachment", "Der Dateiname des Anhangs ist leer.", 400);
    const content = decodeBase64(item.contentBase64);
    total += content.byteLength;
    if (total > MAX_OUTBOUND_ATTACHMENT_BYTES) {
      throw new AppError("attachment_too_large", "Die Anhänge sind zusammen größer als 20 MB.", 400);
    }
    const contentType = cleanToken(item.contentType, 200);
    const contentId = cleanToken(item.contentId, 255)?.replace(/[<>]/g, "");
    return {
      filename,
      content,
      ...(contentType ? { contentType } : {}),
      ...(contentId ? { contentId } : {}),
    };
  });
}

function sanitizeOutboundFilename(name: string): string {
  const base = name.replaceAll("\\", "/").split("/").pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(0, 255);
  if (!cleaned || cleaned === "." || cleaned === "..") return "";
  return cleaned;
}

function decodeBase64(value: string): Uint8Array {
  const compact = value.replace(/\s/g, "").replaceAll("-", "+").replaceAll("_", "/");
  const maxChars = Math.ceil(MAX_OUTBOUND_ATTACHMENT_BYTES / 3) * 4 + 8;
  const padding = compact.length % 4 === 0 ? "" : "=".repeat((4 - (compact.length % 4)) % 4);
  const normalized = compact + padding;
  if (compact.length === 0 || compact.length > maxChars || compact.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new AppError("bad_attachment", "Der Anhang ist kein gültiges Base64.", 400);
  }
  const bytes = Buffer.from(normalized, "base64");
  if (bytes.byteLength === 0) throw new AppError("bad_attachment", "Der Anhang ist kein gültiges Base64.", 400);
  return bytes;
}

function cleanToken(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return cleaned || undefined;
}
