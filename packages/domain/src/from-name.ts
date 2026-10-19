import { AppError } from "./errors.js";

export const MAX_FROM_NAME = 100;

export type OutboundFrom = {
  name?: string;
  address: string;
};

export function outboundFrom(email: string, displayName: string, fromName?: string): OutboundFrom {
  const address = email.trim();
  const override = fromName === undefined ? undefined : parseFromName(fromName);
  const chosen = override ? override : headerName(displayName);
  if (!chosen || chosen.toLowerCase() === address.toLowerCase()) return { address };
  return { name: chosen, address };
}

function parseFromName(value: string): string {
  if (value.trim().length > MAX_FROM_NAME) {
    throw new AppError("from_name_too_long", "Der Absendername ist länger als 100 Zeichen.", 400);
  }
  return headerName(value);
}

function headerName(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}
