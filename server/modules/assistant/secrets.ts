import "server-only";
import crypto from "node:crypto";
import { env } from "@/server/env";

const ENCRYPTED_PREFIX = "enc:v1:";
const PLAIN_PREFIX = "plain:";

function deriveKey(): Buffer | null {
  const secret = env.AUTH_SECRET;
  if (!secret || secret.length < 32) return null;
  return crypto
    .createHash("sha256")
    .update(`kirameku-assistant:${secret}`)
    .digest();
}

export function sealAssistantSecret(value: string): string {
  const clean = value.trim();
  if (!clean) return "";
  const key = deriveKey();
  if (!key) return `${PLAIN_PREFIX}${clean}`;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(clean, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return (
    ENCRYPTED_PREFIX +
    [
      iv.toString("base64url"),
      tag.toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".")
  );
}

export function openAssistantSecret(stored: string): string {
  if (!stored) return "";
  if (stored.startsWith(PLAIN_PREFIX)) {
    return stored.slice(PLAIN_PREFIX.length);
  }
  if (!stored.startsWith(ENCRYPTED_PREFIX)) return stored;

  const key = deriveKey();
  if (!key) return "";

  const [ivPart, tagPart, dataPart] = stored
    .slice(ENCRYPTED_PREFIX.length)
    .split(".");
  if (!ivPart || !tagPart || !dataPart) return "";

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

/** 仅返回脱敏摘要（例如 `sk-••••1234`），绝不泄露完整密钥。 */
export function maskAssistantSecret(raw: string): string {
  const clean = raw.trim();
  if (!clean) return "";
  if (clean.length <= 4) return "••••";
  if (clean.length <= 8) return `••••${clean.slice(-2)}`;
  const prefix = clean.slice(0, 3);
  const suffix = clean.slice(-4);
  return `${prefix}••••${suffix}`;
}
