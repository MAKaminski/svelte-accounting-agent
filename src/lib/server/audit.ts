// Audit log: one row per successful mutating API call (decisions, switches, ledger and credential changes,
// members). Written from handle(), so every write path is covered in one place. Secrets are never stored.
import { currentUserId, getDb, schema } from './db';
import { newId, nowIso } from './util';

const SECRET = /token|secret|password|key|credential/i;

export function redact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SECRET.test(k) ? '[redacted]' : redact(x)]));
  }
  return v;
}

export async function audit(action: string, subject: string | null, detail: unknown, actor = currentUserId() ?? 'system') {
  await getDb().insert(schema.auditLog).values({
    id: newId('aud'), actor, action, subject, detailJson: detail === undefined ? null : JSON.stringify(redact(detail)), at: nowIso()
  });
}
