import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { config } from "../config.js";

// App-layer encryption for Planning Center OAuth tokens at rest. The key is derived
// from the JWT secret so no extra secret needs to be provisioned; RDS encryption
// covers the disk, this covers the column value itself.
const key = scryptSync(config.jwtSecret, "pco-token-encryption", 32);
const ALGORITHM = "aes-256-gcm";

/** Encrypt a token into a self-describing `iv:authTag:ciphertext` base64 string. */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

/** Decrypt a value produced by {@link encryptToken}; returns null if it is missing or malformed. */
export function decryptToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length !== 3) return null;
  try {
    const [iv, authTag, encrypted] = parts.map((part) => Buffer.from(part, "base64"));
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
