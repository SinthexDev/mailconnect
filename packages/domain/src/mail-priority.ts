import { AppError } from "./errors.js";
import type { MailPriority } from "./types.js";

const HIGH = new Set(["high", "1", "urgent", "highest"]);
const NORMAL = new Set(["normal", "3"]);
const LOW = new Set(["low", "5", "lowest"]);

export function normalizeMailPriority(value: string | undefined): MailPriority | undefined {
  if (value === undefined) return undefined;
  const key = value.trim().toLowerCase();
  if (!key) throw new AppError("bad_priority", "Die Priorität darf nicht leer sein.", 400);
  if (HIGH.has(key)) return "high";
  if (NORMAL.has(key)) return "normal";
  if (LOW.has(key)) return "low";
  throw new AppError("bad_priority", "Priorität ist high, normal oder low.", 400);
}

/** Same headers Nodemailer sets for priority (X-Priority, X-MSMail-Priority, Importance). */
export function mailPriorityHeaders(priority: MailPriority | undefined): Record<string, string> | undefined {
  switch (priority) {
    case undefined:
    case "normal":
      return undefined;
    case "high":
      return {
        "X-Priority": "1 (Highest)",
        "X-MSMail-Priority": "High",
        Importance: "High",
      };
    case "low":
      return {
        "X-Priority": "5 (Lowest)",
        "X-MSMail-Priority": "Low",
        Importance: "Low",
      };
    default: {
      const exhaustive: never = priority;
      throw new AppError("bad_priority", `Unbekannte Priorität ${String(exhaustive)}.`, 400);
    }
  }
}
