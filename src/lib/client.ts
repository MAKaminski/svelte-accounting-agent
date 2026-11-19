// Browser side of the registry: every UI action calls the same route the CLI calls.
import { commandByName, buildPath, camel } from './commands';

export class ApiError extends Error {
  constructor(public code: string, message: string, public source: string = 'app', public status = 0) { super(message); }
}

export async function call<T = unknown>(name: string, values: Record<string, unknown> = {}, fetchImpl: typeof fetch = fetch): Promise<T> {
  const cmd = commandByName.get(name);
  if (!cmd) throw new Error(`unknown command ${name}`);
  const body = { ...Object.fromEntries(Object.entries(values).filter(([k]) => cmd.params.some((p) => p.in === 'body' && camel(p.name) === k) || k === 'wait')), ...(cmd.body ?? {}) };
  const res = await fetchImpl(buildPath(cmd, values), {
    method: cmd.method,
    headers: { 'content-type': 'application/json' },
    body: cmd.method === 'GET' ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) throw new ApiError(data?.error?.code ?? 'http', data?.error?.message ?? `HTTP ${res.status}`, data?.error?.source, res.status);
  return data as T;
}

export const money = (c: number | null | undefined, signed = true) =>
  c == null ? '' : (c < 0 ? '−' : signed && c > 0 ? '+' : '') + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const sourceLabel: Record<string, string> = { slash: 'Slash', qbo: 'QuickBooks', model: 'Model', app: 'App' };
