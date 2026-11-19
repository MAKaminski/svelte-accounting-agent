// Model port: Anthropic (Haiku/Sonnet), Ollama (Tier 1, optional), and a deterministic fixture for CI.
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppError, sha256, normalizeMerchant } from '../util';
import { env } from '../env';
import type { Usage } from './pricing';

export interface ModelRequest {
  step: 'recommend' | 'identify';
  model: string;
  /** Stable, cacheable prefix. No dates or ids inside it. */
  system: string;
  /** Volatile suffix (JSON). */
  user: string;
  maxTokens: number;
  jsonSchema: Record<string, unknown>;
}
export interface ModelResult { text: string; model: string; usage: Usage; ttftMs: number | null; e2eMs: number }
export interface ModelPort { readonly mode: 'fixture' | 'live'; complete(req: ModelRequest): Promise<ModelResult> }

export class ModelUnavailableError extends AppError {
  constructor(message: string) { super('model_unavailable', message, 503, 'model'); }
}

export class AnthropicModel implements ModelPort {
  readonly mode = 'live' as const;
  private client: Anthropic;
  constructor() {
    this.client = new Anthropic({ timeout: 30_000, maxRetries: 0 }); // retries/fallback are ours (one retry, then Sonnet)
  }
  async complete(req: ModelRequest): Promise<ModelResult> {
    const t0 = Date.now();
    let ttft: number | null = null;
    try {
      const stream = this.client.messages.stream({
        model: req.model,
        max_tokens: req.maxTokens,
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: req.user }],
        output_config: { effort: req.model.includes('sonnet') ? 'medium' : 'low', format: { type: 'json_schema', schema: req.jsonSchema } }
      } as Anthropic.MessageStreamParams);
      stream.on('text', () => { if (ttft === null) ttft = Date.now() - t0; });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') throw new ModelUnavailableError('Model declined the request (refusal)');
      const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
      const u = msg.usage;
      return {
        text, model: req.model, ttftMs: ttft, e2eMs: Date.now() - t0,
        usage: { fresh: u.input_tokens, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, out: u.output_tokens }
      };
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (e instanceof Anthropic.BadRequestError) throw new AppError('model_bad_request', `Anthropic 400: ${e.message}`, 502, 'model');
      if (e instanceof Anthropic.AuthenticationError) throw new AppError('model_auth', 'ANTHROPIC_API_KEY rejected', 503, 'model');
      if (e instanceof Anthropic.APIError || e instanceof Error) throw new ModelUnavailableError(e.message);
      throw e;
    }
  }
}

/** Tier 1: local Ollama (merchant identification only). keep_alive keeps weights + KV cache warm. */
export class OllamaModel implements ModelPort {
  readonly mode = 'live' as const;
  constructor(private url = env('OLLAMA_URL'), private name = env('OLLAMA_MODEL', 'llama3.1:8b-instruct-q4_K_M')) {}
  async complete(req: ModelRequest): Promise<ModelResult> {
    const t0 = Date.now();
    const res = await fetch(`${this.url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.name, stream: false, keep_alive: '30m', format: req.jsonSchema,
        options: { num_ctx: 4096 },
        messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }]
      }),
      signal: AbortSignal.timeout(20_000)
    }).catch((e: Error) => { throw new ModelUnavailableError(`Ollama: ${e.message}`); });
    if (!res.ok) throw new ModelUnavailableError(`Ollama ${res.status}`);
    const j = await res.json() as { message: { content: string }; prompt_eval_count?: number; eval_count?: number };
    return { text: j.message.content, model: `ollama:${this.name}`, ttftMs: null, e2eMs: Date.now() - t0,
      usage: { fresh: j.prompt_eval_count ?? 0, cacheWrite: 0, cacheRead: 0, out: j.eval_count ?? 0 } };
  }
}

/**
 * Deterministic fixture model. Answers from fixtures/model/<step>.json keyed by the normalized
 * transaction description. It proves the harness (prompting, caching accounting, schema validation,
 * routing, scoring) without a key; model QUALITY is only measured in MODEL_MODE=live.
 * Usage numbers simulate prompt caching: first call per system prefix writes, later calls read.
 */
export class FixtureModel implements ModelPort {
  readonly mode = 'fixture' as const;
  private table: Record<string, Record<string, unknown>>;
  private seenPrefixes = new Set<string>();
  calls: ModelRequest[] = [];
  /** Test hooks */
  failNext = 0;
  invalidNext = 0;
  constructor(dir = resolve(process.cwd(), 'fixtures/model')) {
    this.table = {
      recommend: JSON.parse(readFileSync(resolve(dir, 'recommend.json'), 'utf8')),
      identify: JSON.parse(readFileSync(resolve(dir, 'identify.json'), 'utf8'))
    };
  }
  async complete(req: ModelRequest): Promise<ModelResult> {
    this.calls.push(req);
    if (this.failNext > 0) { this.failNext--; throw new ModelUnavailableError('Fixture model set to fail (simulated 529 overloaded)'); }
    const input = JSON.parse(req.user) as { transaction: { description: string; amountCents: number } };
    const key = normalizeMerchant(input.transaction.description);
    const amountKey = `${key}|${input.transaction.amountCents}`;
    const tbl = this.table[req.step];
    const answer = tbl[amountKey] ?? tbl[key] ?? tbl['__default__'];
    // "$AMOUNT" in a fixture line means "the transaction amount" (single-line answers reused across amounts).
    const filled = JSON.parse(JSON.stringify(answer ?? {}).replaceAll('"$AMOUNT"', String(input.transaction.amountCents)));
    const text = this.invalidNext > 0 ? (this.invalidNext--, '{"action":"code"') : JSON.stringify(filled);
    const prefix = sha256(req.model + req.system);
    const sysTok = Math.ceil(req.system.length / 4);
    const first = !this.seenPrefixes.has(prefix);
    this.seenPrefixes.add(prefix);
    return {
      text, model: `fixture:${req.model}`, ttftMs: 0, e2eMs: 0,
      usage: { fresh: Math.ceil(req.user.length / 4), cacheWrite: first ? sysTok : 0, cacheRead: first ? 0 : sysTok, out: Math.ceil(text.length / 4) }
    };
  }
}
