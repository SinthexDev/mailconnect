import { AppError } from "./errors.js";
import type { FlagMode } from "./types.js";

const SYSTEM_FLAGS: Record<string, string> = {
  seen: "\\Seen",
  answered: "\\Answered",
  flagged: "\\Flagged",
  deleted: "\\Deleted",
  draft: "\\Draft",
};

export function normalizeFlag(flag: string): string {
  const trimmed = flag.trim();
  if (!trimmed) throw new AppError("bad_flag", "Eine Markierung darf nicht leer sein.", 400);
  const body = trimmed.startsWith("\\") ? trimmed.slice(1) : trimmed;
  if (body.toLowerCase() === "recent") throw new AppError("bad_flag", "\\Recent setzt der Server selbst.", 400);
  const system = SYSTEM_FLAGS[body.toLowerCase()];
  if (system) return system;
  if (trimmed.startsWith("\\")) throw new AppError("bad_flag", `Die Markierung ${trimmed} lässt sich nicht setzen.`, 400);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(trimmed)) {
    throw new AppError("bad_flag", "Eine eigene Markierung darf nur Buchstaben, Ziffern, Bindestrich und Unterstrich enthalten.", 400);
  }
  return trimmed;
}

export function normalizeFlags(flags: string[]): string[] {
  const unique: string[] = [];
  for (const flag of flags) {
    const canonical = normalizeFlag(flag);
    if (!unique.includes(canonical)) unique.push(canonical);
  }
  return unique;
}

export function applyFlagMode(current: string[], mode: FlagMode, flags: string[]): string[] {
  switch (mode) {
    case "set":
      return [...flags];
    case "add":
      return [...new Set([...current, ...flags])];
    case "remove":
      return current.filter((flag) => !flags.includes(flag));
    default: {
      const exhaustive: never = mode;
      throw new AppError("bad_flag", `Unbekannte Aktion ${String(exhaustive)}.`, 400);
    }
  }
}

export function inferDelimiter(paths: string[]): "/" | "." {
  const known = new Set(paths);
  let slash = 0;
  let dot = 0;
  for (const path of paths) {
    const slashAt = path.lastIndexOf("/");
    if (slashAt > 0 && known.has(path.slice(0, slashAt))) slash += 1;
    const dotAt = path.lastIndexOf(".");
    if (dotAt > 0 && known.has(path.slice(0, dotAt))) dot += 1;
  }
  if (dot > slash) return ".";
  if (slash > 0 || paths.some((path) => path.includes("/"))) return "/";
  if (dot > 0 || paths.some((path) => path.includes("."))) return ".";
  return "/";
}

export function isDirectChild(path: string, parent: string, delimiter: string): boolean {
  if (!delimiter) return parent === "" ? true : path === parent;
  if (parent === "") return !path.includes(delimiter);
  const prefix = `${parent}${delimiter}`;
  if (!path.startsWith(prefix)) return false;
  return !path.slice(prefix.length).includes(delimiter);
}

export function filterDirectChildren<T>(items: T[], parent: string | undefined, pathOf: (item: T) => string, paths: string[]): T[] {
  if (parent === undefined) return items;
  const delimiter = inferDelimiter(paths);
  return items.filter((item) => isDirectChild(pathOf(item), parent, delimiter));
}

export function rewriteFolderPath(folder: string, from: string, to: string, delimiter: string): string | null {
  if (folder === from) return to;
  if (!delimiter) return null;
  const prefix = from.endsWith(delimiter) ? from : `${from}${delimiter}`;
  if (!folder.startsWith(prefix)) return null;
  const rest = folder.slice(prefix.length);
  const next = to.endsWith(delimiter) ? to : `${to}${delimiter}`;
  return `${next}${rest}`;
}

export function assertFolderPath(folder: string): string {
  const path = folder.trim();
  if (!path || path.length > 400) throw new AppError("bad_folder", "Der Ordnername fehlt oder ist zu lang.", 400);
  if (/[\u0000-\u001f\u007f]/.test(path)) throw new AppError("bad_folder", "Der Ordnername enthält ungültige Zeichen.", 400);
  return path;
}

export function assertNotInbox(folder: string, action: "löschen" | "umbenennen"): void {
  if (folder.toUpperCase() === "INBOX") throw new AppError("imap_inbox", `INBOX lässt sich nicht ${action}.`, 400);
}

export function buildPlainMessage(input: { from: string; to: string[]; cc: string[]; subject: string; text: string; date: Date }): string {
  const lines = [
    `From: ${headerValue(input.from)}`,
    `To: ${input.to.map(headerValue).join(", ")}`,
    input.cc.length > 0 ? `Cc: ${input.cc.map(headerValue).join(", ")}` : null,
    `Subject: ${headerValue(input.subject)}`,
    `Date: ${input.date.toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
  ].filter((line): line is string => line !== null);
  return `${lines.join("\r\n")}\r\n\r\n${input.text.replace(/\r?\n/g, "\r\n")}`;
}

function headerValue(value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  if (/^[\u0020-\u007e]*$/.test(clean)) return clean;
  const bytes = new TextEncoder().encode(clean);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}
