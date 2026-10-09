import { createHash, randomBytes } from "node:crypto";
import type { SecretHasher } from "@mailconnect/domain";

export function createSecretHasher(pepper: string): SecretHasher {
  if (pepper.length < 32) {
    throw new Error("SESSION_SECRET muss mindestens 32 Zeichen lang sein.");
  }
  return {
    hash(purpose, secret) {
      return createHash("sha256").update(`${purpose}.${pepper}.${secret}`).digest("hex");
    },
    newSecret() {
      return randomBytes(32).toString("base64url");
    },
  };
}
