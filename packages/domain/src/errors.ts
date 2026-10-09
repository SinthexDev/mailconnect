export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function notFound(message = "Nicht gefunden."): AppError {
  return new AppError("not_found", message, 404);
}

export function forbidden(message = "Keine Berechtigung."): AppError {
  return new AppError("forbidden", message, 403);
}

export function unauthorized(message = "Anmeldung erforderlich."): AppError {
  return new AppError("unauthorized", message, 401);
}
