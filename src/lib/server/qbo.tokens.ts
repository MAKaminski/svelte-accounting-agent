// QuickBooks tokens, encrypted at rest with TOKEN_ENC_KEY (AES-256-GCM).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, schema } from './db';
import { env } from './env';
import { AppError, nowIso } from './util';
import type { QboTokenStore } from './qbo';

function key() {
  const k = env('TOKEN_ENC_KEY');
  if (!k) throw new AppError('token_key_missing', 'TOKEN_ENC_KEY is not set (generate: openssl rand -base64 32)', 503);
  return createHash('sha256').update(k).digest();
}
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
export function decrypt(blob: string): string {
  const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

export const qboTokenStore: QboTokenStore = {
  get() {
    const row = getDb().select().from(schema.qboTokens).limit(1).get();
    if (!row) return null;
    return { realmId: row.realmId, accessToken: decrypt(row.accessTokenEnc), refreshToken: decrypt(row.refreshTokenEnc), expiresAt: row.expiresAt };
  },
  save(t) {
    const db = getDb();
    const values = { realmId: t.realmId, accessTokenEnc: encrypt(t.accessToken), refreshTokenEnc: encrypt(t.refreshToken), expiresAt: t.expiresAt, updatedAt: nowIso() };
    const existing = db.select().from(schema.qboTokens).where(eq(schema.qboTokens.realmId, t.realmId)).get();
    if (existing) db.update(schema.qboTokens).set(values).where(eq(schema.qboTokens.realmId, t.realmId)).run();
    else db.insert(schema.qboTokens).values(values).run();
  }
};
