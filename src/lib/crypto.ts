import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env";

// AES-256-GCM for social account tokens at rest. Format: v1.<iv>.<tag>.<ciphertext> (base64url).
function key(): Buffer {
  const k = Buffer.from(env("TOKEN_KEY"), "hex");
  if (k.length !== 32) throw new Error("TOKEN_KEY must be 64 hex characters (32 bytes).");
  return k;
}
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}
export function decrypt(blob: string): string {
  const [v, iv, tag, body] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("Unreadable token.");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}
export function randomId(bytes = 18): string { return randomBytes(bytes).toString("base64url"); }
