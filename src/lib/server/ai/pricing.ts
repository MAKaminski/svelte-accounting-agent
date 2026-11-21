// USD per 1M tokens (input, output). Source: claude-api skill model table, cached 2026-11-03 — re-verify before budgeting.
// Haiku 5.5 rate applies to prompts ≤100K tokens (ours are ~4–6K).
const RATES: Record<string, { in: number; out: number }> = {
  'claude-haiku-5-5': { in: 0.10, out: 0.50 },
  'claude-sonnet-5-5': { in: 2.00, out: 10.00 },
  'claude-opus-5-5': { in: 4.00, out: 20.00 },
  'claude-haiku-4-5': { in: 1.00, out: 5.00 }
};

export interface Usage { fresh: number; cacheWrite: number; cacheRead: number; out: number }

/** c = (fresh × in + cache_write × in × 1.25 + cache_read × in × 0.10 + out × out_rate) ÷ 1M */
export function costUsd(model: string, u: Usage): number {
  if (model.startsWith('ollama:') || model.startsWith('rules') || model.startsWith('fixture-rules')) return 0;
  const r = RATES[model.replace(/^fixture:/, '')] ?? RATES['claude-haiku-5-5'];
  return (u.fresh * r.in + u.cacheWrite * r.in * 1.25 + u.cacheRead * r.in * 0.1 + u.out * r.out) / 1_000_000;
}
