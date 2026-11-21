// MW.payouts.import — parse + validate a payout CSV (payout_id,date,gross,fees,shipping,net), upsert rows.
import { getDb, schema } from '../db';
import { AppError } from '../util';
import { withRun } from './runs';
import { and, gt, inArray } from 'drizzle-orm';
import { enqueue, drain } from './queue';
import { researchAndRecommend } from './pipeline';

const toCents = (s: string) => {
  if (!/^-?\d+(\.\d{1,2})?$/.test(s.trim())) return NaN;
  return Math.round(Number(s) * 100);
};

export function parsePayoutCsv(csv: string, channel = 'whatnot') {
  const lines = csv.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const header = lines.shift()?.split(',').map((h) => h.trim().toLowerCase()) ?? [];
  const need = ['payout_id', 'date', 'gross', 'fees', 'shipping', 'net'];
  const missing = need.filter((h) => !header.includes(h));
  if (missing.length) return { rows: [], errors: [`line 1: missing columns ${missing.join(', ')}`] };
  const idx = Object.fromEntries(need.map((h) => [h, header.indexOf(h)]));
  const rows: (typeof schema.payoutRows.$inferInsert)[] = [];
  const errors: string[] = [];
  lines.forEach((line, i) => {
    const n = i + 2;
    const c = line.split(',').map((x) => x.trim());
    const [gross, fees, shipping, net] = ['gross', 'fees', 'shipping', 'net'].map((k) => toCents(c[idx[k]] ?? ''));
    const date = c[idx.date] ?? '';
    const payoutId = c[idx.payout_id] ?? '';
    if (!payoutId) errors.push(`line ${n}: payout_id is empty`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push(`line ${n}: date "${date}" is not YYYY-MM-DD`);
    if ([gross, fees, shipping, net].some(Number.isNaN)) { errors.push(`line ${n}: amounts must be numbers like 1234.56`); return; }
    if (Math.abs(gross - fees - shipping - net) > 1) errors.push(`line ${n}: gross − fees − shipping = ${(gross - fees - shipping) / 100} ≠ net ${net / 100}`);
    rows.push({ id: `${channel}:${payoutId}`, channel, payoutId, date, grossCents: gross, feesCents: fees, shippingCents: shipping, netCents: net });
  });
  return { rows, errors };
}

export async function importPayouts(csv: string, channel = 'whatnot', opts: { wait?: boolean } = {}) {
  return withRun('MW.payouts.import', null, async () => {
    const { rows, errors } = parsePayoutCsv(csv, channel);
    if (errors.length) throw new AppError('bad_csv', errors.join('\n'), 400);
    const db = getDb();
    await db.transaction(async (tx) => {
      for (const r of rows) await tx.insert(schema.payoutRows).values(r).onConflictDoUpdate({ target: [schema.payoutRows.orgId, schema.payoutRows.id], set: r }).run();
    });
    // Deposits waiting for review may now match a payout row: re-research them.
    const credits = await db.select({ id: schema.ledgerItems.id }).from(schema.ledgerItems)
      .where(and(gt(schema.ledgerItems.amountCents, 0), inArray(schema.ledgerItems.localState, ['fetched', 'researched', 'recommended', 'invalid']))).all();
    for (const c of credits) enqueue(() => researchAndRecommend(c.id).then(() => undefined));
    if (opts.wait) await drain();
    return { imported: rows.length, channel, errors: [] as string[] };
  });
}
