import type { MailAttachment } from "@mailconnect/domain";

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export type StructureNode = {
  part?: string;
  type?: string;
  parameters?: Record<string, string>;
  disposition?: string;
  dispositionParameters?: Record<string, string>;
  size?: number;
  childNodes?: StructureNode[];
};

export function listAttachments(node: StructureNode | undefined): MailAttachment[] {
  const found: MailAttachment[] = [];
  walk(node, found);
  return found;
}

function walk(node: StructureNode | undefined, found: MailAttachment[]): void {
  if (!node) return;
  const type = (node.type ?? "").toLowerCase();
  if (type.startsWith("multipart/") || (type === "message/rfc822" && (node.childNodes?.length ?? 0) > 0)) {
    for (const child of node.childNodes ?? []) walk(child, found);
    return;
  }
  if (!downloadable(node, type)) return;
  const id = node.part && /^\d+(\.\d+)*$/.test(node.part) ? node.part : "1";
  if (found.some((item) => item.id === id)) return;
  found.push({
    id,
    filename: filenameOf(node, type, id),
    contentType: safeType(type),
    size: typeof node.size === "number" && node.size >= 0 ? node.size : null,
  });
}

function downloadable(node: StructureNode, type: string): boolean {
  const disposition = (node.disposition ?? "").toLowerCase();
  const named = Boolean(rawFilename(node));
  if (disposition === "attachment") return true;
  if (named && type !== "text/plain" && type !== "text/html") return true;
  if (type.startsWith("application/") || type.startsWith("image/") || type.startsWith("audio/") || type.startsWith("video/")) return true;
  return false;
}

function filenameOf(node: StructureNode, type: string, id: string): string {
  const cleaned = sanitizeFilename(rawFilename(node));
  if (cleaned) return cleaned;
  return `anhang-${id.replaceAll(".", "-")}${extensionFor(type)}`;
}

function rawFilename(node: StructureNode): string {
  return node.dispositionParameters?.filename || node.parameters?.name || "";
}

function sanitizeFilename(name: string): string {
  const base = name.replaceAll("\\", "/").split("/").pop() ?? "";
  return base.replace(/[\r\n\0"]/g, "").trim().slice(0, 180);
}

function safeType(type: string): string {
  const cleaned = type.toLowerCase().split(";")[0]?.trim() ?? "";
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(cleaned) ? cleaned : "application/octet-stream";
}

function extensionFor(type: string): string {
  if (type === "application/pdf") return ".pdf";
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/png") return ".png";
  if (type === "image/gif") return ".gif";
  if (type === "text/csv") return ".csv";
  if (type === "application/xml" || type === "text/xml") return ".xml";
  if (type.includes("spreadsheet") || type.includes("excel")) return ".xlsx";
  if (type.includes("wordprocessing")) return ".docx";
  if (type === "application/zip") return ".zip";
  return "";
}
