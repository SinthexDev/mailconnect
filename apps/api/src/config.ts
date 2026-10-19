import { existsSync, readFileSync } from "node:fs";

export type AppConfig = {
  host: string;
  port: number;
  basePath: string;
  publicUrl: string;
  databasePath: string;
  masterKey: Buffer;
  sessionSecret: string;
  secureCookies: boolean;
  pollMs: number;
  cronSecret: string;
  syncBatch: number;
  webDist: string;
};

export function loadDotEnv(path = process.env.MAILCONNECT_ENV ?? ".env"): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const masterKey = Buffer.from(env.MAILCONNECT_MASTER_KEY ?? "", "base64");
  if (masterKey.length !== 32) {
    throw new Error("MAILCONNECT_MASTER_KEY muss 32 Bytes in Base64 sein.");
  }
  const sessionSecret = env.SESSION_SECRET ?? "";
  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET muss mindestens 32 Zeichen lang sein.");
  }
  const port = Number(env.PORT ?? 3911);
  const basePath = (env.APP_BASE_PATH ?? "").replace(/\/$/, "");
  const publicUrl = (env.APP_BASE_URL ?? `http://127.0.0.1:${port}${basePath}`).replace(/\/$/, "");
  return {
    host: env.HOST ?? "127.0.0.1",
    port,
    basePath,
    publicUrl,
    databasePath: env.DATABASE_PATH ?? "./var/mailconnect.sqlite",
    masterKey,
    sessionSecret,
    secureCookies: env.NODE_ENV === "production",
    pollMs: Number(env.INDEX_POLL_MS ?? 300_000),
    cronSecret: env.CRON_SECRET ?? "",
    syncBatch: Number(env.INDEX_BATCH ?? 80),
    webDist: env.WEB_DIST ?? "./public",
  };
}
