import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

let encryptionKey: Buffer | null = null;

function loadOrCreateKey(dataDir: string): Buffer {
  if (encryptionKey) return encryptionKey;

  const keyPath = path.join(dataDir, ".encryption.key");
  if (fs.existsSync(keyPath)) {
    encryptionKey = Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "hex");
  } else {
    encryptionKey = crypto.randomBytes(32);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(keyPath, encryptionKey.toString("hex"), { mode: 0o600 });
  }
  return encryptionKey;
}

export function initEncryption(dataDir: string): void {
  loadOrCreateKey(dataDir);
}

export function encrypt(plaintext: string): string {
  if (!encryptionKey) throw new Error("Encryption not initialized");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  if (!encryptionKey) throw new Error("Encryption not initialized");
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  if (!ivHex || !tagHex || !dataHex) return ciphertext; // not encrypted (legacy)
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(dataHex, "hex")).toString("utf8") + decipher.final("utf8");
}

export function encryptEnvVars(vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    out[k] = v ? encrypt(v) : v;
  }
  return out;
}

export function decryptEnvVars(vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    try { out[k] = v ? decrypt(v) : v; } catch { out[k] = v; }
  }
  return out;
}
