// API helper: parse JSON body, run the handler, map AppError → { error } with an HTTP status.
// HTTP 4xx → CLI exit 1 (user error); 5xx → exit 2 (upstream/system error).
import { json, type RequestEvent } from '@sveltejs/kit';
import { AppError } from './util';
import { commandForRoute } from '$lib/commands';
import { audit } from './audit';
import { armCommitTimer } from './scheduler';

export function handle<T>(fn: (ctx: { body: Record<string, unknown>; event: RequestEvent }) => Promise<T> | T) {
  return async (event: RequestEvent) => {
    const t0 = Date.now();
    try {
      let body: Record<string, unknown> = {};
      if (event.request.method !== 'GET') {
        const text = await event.request.text();
        if (text) {
          try { body = JSON.parse(text); } catch { throw new AppError('bad_json', 'Request body is not JSON', 400); }
        }
      }
      const data = await fn({ body, event });
      if (event.request.method !== 'GET') {
        const cmd = commandForRoute(event.request.method, event.route.id);
        await audit(cmd?.process ?? `${event.request.method} ${event.route.id}`, event.params.id ?? null, { command: cmd?.name ?? null, body });
        await armCommitTimer(); // an approve/undo may have opened or closed an undo window
      }
      return json(data, { headers: { 'server-timing': `app;dur=${Date.now() - t0}` } });
    } catch (e) {
      if (e instanceof AppError) {
        return json({ error: { code: e.code, message: e.message, source: e.source } }, { status: e.status >= 500 ? (e.source === 'app' ? 500 : 502) : e.status });
      }
      console.error(e);
      return json({ error: { code: 'internal', message: (e as Error).message, source: 'app' } }, { status: 500 });
    }
  };
}

export const bool = (v: unknown) => v === true || v === 'true';
export const str = (v: unknown) => (typeof v === 'string' && v.length ? v : undefined);
