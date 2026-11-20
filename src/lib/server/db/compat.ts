// Thin helpers on Drizzle's QueryPromise so call sites read like the old better-sqlite3 API,
// but async: `await q.get()` (first row | undefined), `await q.all()` (rows), `await q.run()`.
import { QueryPromise } from 'drizzle-orm';
import { PgSelectBase } from 'drizzle-orm/pg-core';

declare module 'drizzle-orm' {
  interface QueryPromise<T> {
    get(): Promise<T extends (infer R)[] ? R | undefined : T>;
    all(): Promise<T>;
    run(): Promise<T>;
  }
}

// PgSelectBase gets QueryPromise's methods copied in by applyMixins at load time, so patch it too.
for (const target of [QueryPromise.prototype, PgSelectBase.prototype] as unknown as Record<string, unknown>[]) {
  if (target.get) continue;
  target.get = function (this: QueryPromise<unknown[]>) { return this.execute().then((r) => (Array.isArray(r) ? r[0] : r)); };
  target.all = function (this: QueryPromise<unknown>) { return this.execute(); };
  target.run = function (this: QueryPromise<unknown>) { return this.execute(); };
}
