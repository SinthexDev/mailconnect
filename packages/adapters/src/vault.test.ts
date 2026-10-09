import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { AesGcmVault } from "./vault.js";

test("vault roundtrip and tamper detection", () => {
  const vault = new AesGcmVault(randomBytes(32));
  const blob = vault.encrypt("mail-secret");
  assert.equal(vault.decrypt(blob), "mail-secret");
  const tampered = { ...blob, ciphertext: Buffer.from(blob.ciphertext) };
  tampered.ciphertext[0] ^= 0xff;
  assert.throws(() => vault.decrypt(tampered));
});
