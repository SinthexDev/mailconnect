import { AppError } from "./errors.js";

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

/** Empty input clears the username. Otherwise 3–32 letters, digits, . _ - */
export function normalizeUsername(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) {
    throw new AppError("bad_username", "Der Benutzername darf kein @ enthalten.", 400);
  }
  if (!USERNAME_RE.test(trimmed)) {
    throw new AppError("bad_username", "Der Benutzername braucht 3 bis 32 Zeichen und darf nur Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich enthalten.", 400);
  }
  return trimmed;
}

export function normalizeLogin(value: string): { kind: "email" | "username"; value: string } {
  const trimmed = value.trim();
  if (!trimmed) throw new AppError("invalid_login", "E-Mail oder Benutzername fehlt.", 400);
  if (trimmed.includes("@")) {
    return { kind: "email", value: trimmed.toLowerCase() };
  }
  const username = normalizeUsername(trimmed);
  if (!username) throw new AppError("invalid_login", "E-Mail oder Benutzername fehlt.", 400);
  return { kind: "username", value: username };
}
