import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { CredentialVault, EncryptedBlob } from "@mailconnect/domain";

const VERSION = 1;

export class AesGcmVault implements CredentialVault {
  constructor(private readonly masterKey: Buffer) {
    if (masterKey.length !== 32) {
      throw new Error("MAILCONNECT_MASTER_KEY muss 32 Bytes lang sein.");
    }
  }

  encrypt(plaintext: string): EncryptedBlob {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: VERSION };
  }

  decrypt(blob: EncryptedBlob): string {
    if (blob.keyVersion !== VERSION) {
      throw new Error("Unbekannte Schlüsselversion.");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.masterKey, blob.iv);
    decipher.setAuthTag(blob.authTag);
    return Buffer.concat([decipher.update(blob.ciphertext), decipher.final()]).toString("utf8");
  }
}
