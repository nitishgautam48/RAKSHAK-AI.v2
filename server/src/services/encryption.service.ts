import crypto from 'node:crypto';
import { env } from '../config/env.js';

// Field-level PII encryption (AES-256-GCM). The key is derived via SHA-256
// from ENCRYPTION_KEY so any passphrase length works; ciphertext is stored
// as base64(iv):base64(authTag):base64(cipher) so it round-trips through a
// plain SQLite TEXT column (and a Postgres TEXT column after migration).
const key = crypto.createHash('sha256').update(env.encryptionKey).digest();

export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptField(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted field payload');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

// Masked display for UI contexts that should never see full PII
// (e.g. list views) but need a stable, human-recognizable placeholder.
export function maskContact(raw: string): string {
  if (raw.length <= 4) return '*'.repeat(raw.length);
  return raw.slice(0, 2) + '*'.repeat(raw.length - 4) + raw.slice(-2);
}
