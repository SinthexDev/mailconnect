import argon2 from "argon2";
import type { PasswordHasher } from "@mailconnect/domain";

const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

let dummyHash: Promise<string> | null = null;

function placeholderHash(): Promise<string> {
  dummyHash ??= argon2.hash("mailconnect-dummy-password", OPTIONS);
  return dummyHash;
}

export const passwordHasher: PasswordHasher = {
  hash(password: string) {
    return argon2.hash(password, OPTIONS);
  },
  async verify(password: string, passwordHash: string) {
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      await argon2.verify(await placeholderHash(), password);
      return false;
    }
  },
};
