<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { call } from '$lib/client';
  import { ui } from '$lib/ui.svelte';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import type { LedgerConnection } from '$lib/types';
  let { data } = $props();

  type Detail = LedgerConnection & { health: { ok: boolean; message: string } | null; ledgerAccounts: { id: string; name: string }[]; qboBankAccounts: { id: string; name: string }[] };
  let busy = $state<string | null>(null);
  let health = $state<Record<string, { ok: boolean; message: string }>>({});
  let adding = $state(false);
  let form = $state({ kind: 'mercury', name: 'Mercury', mode: 'fixture', token: '', confirm: false });
  let configuring = $state<Detail | null>(null);
  let bankMap = $state<Record<string, string>>({});
  let confirmFeed = $state(false);

  const active = $derived(data.ledgers.filter((l) => l.status === 'active').length);
  const direct = (l: LedgerConnection) => l.capabilities.code === 'qbo_direct';

  async function act<T>(key: string, fn: () => Promise<T>, ok?: (r: T) => string) {
    busy = key;
    try { const r = await fn(); if (ok) ui.toast(ok(r)); await invalidateAll(); return r; }
    catch (e) { ui.toast((e as Error).message, { kind: 'error', ms: 8000 }); }
    finally { busy = null; }
  }
  const test = (l: LedgerConnection) => act(`test:${l.id}`, () => call<Detail>('ledger.test', { id: l.id }), (r) => { health[l.id] = r.health!; return `${l.name}: ${r.health?.ok ? 'connection ok' : 'test failed'}`; });
  const toggle = (l: LedgerConnection) => act(`state:${l.id}`, () => call(l.status === 'active' ? 'ledger.disable' : 'ledger.enable', { id: l.id }), () => `${l.name} ${l.status === 'active' ? 'deactivated' : 'activated'}`);
  async function openConfig(l: LedgerConnection) {
    const d = await act(`cfg:${l.id}`, () => call<Detail>('ledger.show', { id: l.id }));
    if (!d) return;
    configuring = d;
    bankMap = { ...(d.config.qboBankAccountIdByAccount ?? {}) };
    confirmFeed = !!d.bankFeedConfirmedAt;
  }
  async function saveConfig() {
    if (!configuring) return;
    const qboBank = Object.entries(bankMap).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(',');
    const r = await act('save', () => call<LedgerConnection>('ledger.configure', { id: configuring!.id, qboBank: qboBank || undefined, confirmBankFeed: confirmFeed }), () => 'Saved');
    if (r) configuring = null;
  }
  async function add() {
    const r = await act('add', () => call<LedgerConnection>('ledger.add', { kind: form.kind, name: form.name, mode: form.mode, token: form.token || undefined, confirmBankFeed: form.confirm }),
      (c) => `Added ${c.name}${c.blockers.length ? ' — finish setup before activating' : ''}`);
    if (r) { adding = false; form.token = ''; await openConfig(r); }
  }
</script>

<svelte:head><title>Ledgers · LaceLuxx Books</title></svelte:head>
<header>
  <h1>Ledgers</h1>
  <span class="muted">{data.ledgers.length} connection{data.ledgers.length === 1 ? '' : 's'} · {active} active</span>
  <button class="btn dark" type="button" onclick={() => (adding = !adding)}>{adding ? 'Close' : 'Add connection'}</button>
</header>

{#if data.error}
  <ErrorState message={data.error.message} source={data.error.source} onretry={() => invalidateAll()} />
{:else}
  <div class="split">
    <section class="list" aria-label="Connections">
      {#if !data.ledgers.length}
        <div class="card empty"><p class="big">No ledgers connected.</p><p class="muted">Add Slash or Mercury to start pulling transactions.</p></div>
      {/if}
      {#each data.ledgers as l (l.id)}
        {@const h = health[l.id]}
        <article class="card conn" class:bad={!!l.lastError || h?.ok === false}>
          <div class="top">
            <span class="kind {l.kind}">{l.kind.toUpperCase()}</span><strong>{l.name}</strong><span class="muted small">{l.mode} · {l.id}</span>
            <span class="status {l.status}">{l.status === 'active' ? 'Active' : 'Inactive'}</span>
          </div>
          <div class="facts">
            <div><span class="lbl">Writes to</span>{direct(l) ? 'QuickBooks directly (dedupe first)' : `${l.name} → its QuickBooks sync`}</div>
            <div><span class="lbl">Chart</span>{l.capabilities.chart === 'qbo' ? 'QuickBooks accounts' : `${l.name} accounts`}</div>
            <div><span class="lbl">Rules</span>{l.capabilities.mappings === 'local' ? 'Local rules' : `${l.name} mappings`}</div>
            <div><span class="lbl">In review · last pull</span>{l.inReview} · {l.lastPullAt ? l.lastPullAt.slice(5, 16).replace('T', ' ') : 'never'}</div>
          </div>
          {#if l.lastError}<p class="err">Last pull failed: {l.lastError}</p>{/if}
          {#if h}<p class={h.ok ? 'ok' : 'err'}>Test {h.ok ? 'passed' : 'failed'}: {h.message}</p>{/if}
          {#if l.blockers.length}
            <div class="blockers"><strong>Before activating:</strong><ul>{#each l.blockers as b}<li>{b}</li>{/each}</ul></div>
          {/if}
          <div class="acts">
            <button class="btn sm" type="button" onclick={() => test(l)} disabled={!!busy}>{busy === `test:${l.id}` ? 'Testing…' : 'Test'}</button>
            <button class="btn sm" class:primary={l.status !== 'active'} type="button" onclick={() => toggle(l)} disabled={!!busy || (l.status !== 'active' && l.blockers.length > 0)}>{l.status === 'active' ? 'Deactivate' : 'Activate'}</button>
            {#if direct(l)}<button class="btn sm" type="button" onclick={() => openConfig(l)} disabled={!!busy}>Configure</button>{/if}
            <a class="small" href="/queue?connection={l.id}">View queue →</a>
          </div>
        </article>
      {/each}
    </section>

    {#if adding}
      <aside class="card panel" aria-label="Add connection">
        <h2>Add connection</h2>
        <label>Kind <select bind:value={form.kind}><option value="mercury">Mercury</option><option value="slash">Slash</option></select></label>
        <label>Name <input bind:value={form.name} /></label>
        <label>Mode <select bind:value={form.mode}><option value="fixture">Fixture (synthetic data)</option><option value="live">Live</option></select></label>
        {#if form.kind === 'mercury' && form.mode === 'live'}
          <label>Mercury token <span class="muted">(read-only is enough; stored encrypted)</span><input type="password" bind:value={form.token} autocomplete="off" /></label>
        {/if}
        {#if form.kind === 'mercury'}
          <div class="warn">Mercury can't code transactions for QuickBooks, so approvals are written to QuickBooks directly. If Mercury's own QuickBooks sync or the QuickBooks bank feed also posts these transactions, they are booked twice.</div>
          <label class="check"><input type="checkbox" bind:checked={form.confirm} /> Mercury's QuickBooks sync and the bank feed for these accounts are off, or I will match them</label>
        {/if}
        <button class="btn primary" type="button" onclick={add} disabled={!!busy || !form.name.trim()}>{busy === 'add' ? 'Adding…' : 'Add connection'}</button>
        <p class="muted small">New connections start inactive. Map accounts and activate after adding.</p>
      </aside>
    {:else if configuring}
      <aside class="card panel" aria-label="Configure {configuring.name}">
        <h2>Configure {configuring.name}</h2>
        {#if !configuring.ledgerAccounts.length}<p class="err">Could not list {configuring.kind} accounts. Run Test to see why.</p>{/if}
        {#each configuring.ledgerAccounts as a}
          <label>{a.name} → QuickBooks bank account
            <select bind:value={bankMap[a.id]} aria-label="QuickBooks bank account for {a.name}">
              <option value="">Choose…</option>
              {#each configuring.qboBankAccounts as b}<option value={b.id}>{b.name} (QuickBooks #{b.id})</option>{/each}
            </select>
          </label>
        {/each}
        <div class="warn">Approvals for this ledger are written to QuickBooks directly. Turn off {configuring.kind === 'mercury' ? "Mercury's QuickBooks sync and " : ''}the QuickBooks bank feed for these accounts, or match them, to avoid double-booking.</div>
        <label class="check"><input type="checkbox" bind:checked={confirmFeed} /> Off, or I will match them{configuring.bankFeedConfirmedBy ? ` (confirmed by ${configuring.bankFeedConfirmedBy})` : ''}</label>
        <div class="acts"><button class="btn primary" type="button" onclick={saveConfig} disabled={!!busy}>Save</button><button class="btn" type="button" onclick={() => (configuring = null)}>Cancel</button></div>
      </aside>
    {/if}
  </div>
{/if}

<style>
  header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
  h1 { margin: 0; font-size: 22px; } header .btn { margin-left: auto; }
  .split { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
  .list { flex: 999 1 560px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .conn { padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
  .conn.bad { border-color: var(--danger-line); }
  .top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .kind { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; background: #e0f2fe; color: #075985; }
  .kind.mercury { background: #ede9fe; color: #5b21b6; }
  .status { margin-left: auto; font-size: 13px; } .status.active { color: var(--ok); } .status.inactive { color: var(--muted); }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; font-size: 13px; }
  .lbl { display: block; color: var(--muted); font-size: 12px; }
  .err { margin: 0; padding: 8px 10px; border-radius: 6px; background: var(--danger-soft); color: var(--danger); font-size: 13px; }
  .ok { margin: 0; padding: 8px 10px; border-radius: 6px; background: var(--ok-soft); color: var(--ok); font-size: 13px; }
  .blockers { font-size: 13px; padding: 8px 10px; border-radius: 6px; background: var(--warn-soft); color: var(--warn-ink); }
  .blockers ul { margin: 4px 0 0; padding-left: 18px; }
  .acts { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .panel { flex: 1 1 320px; max-width: 400px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
  h2 { margin: 0; font-size: 15px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
  label select, label input:not([type='checkbox']) { height: 34px; border: 1px solid var(--line-strong); border-radius: 6px; padding: 0 8px; font-size: 14px; color: var(--ink); }
  .check { flex-direction: row; align-items: flex-start; gap: 8px; font-size: 13px; color: var(--ink); }
  .warn { padding: 10px 12px; border-radius: 6px; background: var(--warn-soft); border: 1px solid var(--warn); color: var(--warn-ink); font-size: 13px; line-height: 1.45; }
  .empty { padding: 40px; text-align: center; } .big { font-size: 16px; font-weight: 500; margin: 0 0 6px; } .empty p { margin: 0; }
  .small { font-size: 12px; }
</style>
