// AI.merchant.identify — judgment (Tier 1 Ollama if configured, else Tier 2 Haiku low). Schema failure → unknown.
import { z } from 'zod';
import { getPorts } from '../ports';
import { config } from '../env';
import { IDENTIFY_JSON_SCHEMA, IDENTIFY_KINDS, IDENTIFY_SYSTEM } from '../prompts/identify.v1';
import { withRun } from './runs';
import { costUsd } from '../ai/pricing';
import { isEnabled } from '../components';

const ProfileSchema = z.object({ kind: z.enum(IDENTIFY_KINDS), summary: z.string().max(300), confidence: z.number().min(0).max(1) });
export type MerchantProfile = z.infer<typeof ProfileSchema> & { model: string; costUsd: number };

export async function identifyMerchant(input: { merchantName: string; mcc: string | null; description: string }, subjectId: string | null, evalCaseId?: string): Promise<MerchantProfile> {
  if (!await isEnabled('AI.merchant.identify')) return { kind: 'unknown', summary: 'Merchant identify is switched off in /system.', confidence: 0, model: 'off', costUsd: 0 };
  return withRun('AI.merchant.identify', subjectId, async () => {
    const { model } = getPorts();
    const local = await isEnabled('model.ollama') ? getPorts().local : null;
    const req = { step: 'identify' as const, model: config.modelWorker, system: IDENTIFY_SYSTEM, maxTokens: 400,
      user: JSON.stringify({ transaction: { description: input.description, amountCents: 0 }, merchantName: input.merchantName, mcc: input.mcc }),
      jsonSchema: IDENTIFY_JSON_SCHEMA as unknown as Record<string, unknown> };
    let res;
    try {
      res = local ? await local.complete(req) : await model.complete(req);
    } catch {
      if (!local) return { kind: 'unknown', summary: 'Model unavailable; merchant not identified.', confidence: 0, model: 'none', costUsd: 0 };
      res = await model.complete(req); // Ollama → Haiku fallback
    }
    let parsed: z.infer<typeof ProfileSchema>;
    try { parsed = ProfileSchema.parse(JSON.parse(res.text)); }
    catch { parsed = { kind: 'unknown', summary: 'Model output failed the schema check.', confidence: 0 }; }
    return { ...parsed, model: res.model, costUsd: costUsd(res.model, res.usage) };
  }, evalCaseId);
}
