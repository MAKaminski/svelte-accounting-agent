import { randomBytes, createHash } from 'node:crypto';

export const nowIso = (d = new Date()) => d.toISOString();
export const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString('base64url')}`;
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Stable JSON: sorted keys, so hashes don't change with key order. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v as object).sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + stableJson((v as Record<string, unknown>)[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

export const fmtCents = (c: number) => {
  const sign = c < 0 ? '-' : c > 0 ? '+' : '';
  return sign + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** App error with an exit-code class and an upstream source, mapped to HTTP by the API layer. */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: 400 | 404 | 409 | 422 | 502 | 503 = 400,
    public source: 'app' | 'slash' | 'qbo' | 'model' = 'app'
  ) {
    super(message);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function normalizeMerchant(s: string): string {
  return s.toLowerCase()
    .replace(/\b(po|inc|llc|co|corp|us|usa|com|www|mktp|mktplace)\b/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trigrams(s: string): Set<string> {
  const p = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
}

/** Jaccard similarity over character trigrams (pg_trgm-style), 0..1. */
export function trigramSimilarity(a: string, b: string): number {
  const A = trigrams(normalizeMerchant(a));
  const B = trigrams(normalizeMerchant(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
