<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { call } from '$lib/client';
  import { ui } from '$lib/ui.svelte';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import type { LedgerConnection } from '$lib/types';
  import { KEY_HELP, type KeyedLedger } from '$lib/ledgerKeys';
  let { data } = $props();

  type Detail = LedgerConnection & { health: { ok: boolean; message: string } | null; ledgerAccounts: { id: string; name: string }[]; qboBankAccounts: { id: string; name: string }[] };
  let busy = $state<string | null>(null);
  let health = $state<Record<string, { ok: boolean; message: string }>>({});
  let adding = $state(false);
  let form = $state({ kind: 'mercury' as KeyedLedger, name: 'Mercury', mode: 'live', token: '', legalEntity: '', confirm: false });
  let newKey = $state('');
  let newEntity = $state('');
  const help = $derived(KEY_HELP[form.kind]);
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
    newKey = ''; newEntity = d.config.legalEntityId ?? '';
  }
  /** Paste a key (or replace one): checked with the ledger first, then stored encrypted and the connection goes live. */
  async function saveKey() {
    if (!configuring || !newKey.trim()) return;
    const r = await act('key', () => call<LedgerConnection>('ledger.configure', { id: configuring!.id, mode: 'live', token: newKey.trim(), legalEntity: configuring!.kind === 'slash' ? newEntity.trim() : undefined }),
      (c) => `Key accepted. ${c.name} now pulls live data${c.blockers.length ? ' once the remaining steps are done' : ''}.`);
    newKey = '';
    if (r) await openConfig(r);
  }
  async function saveConfig() {
    if (!configuring) return;
    const qboBank = Object.entries(bankMap).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(',');
    const r = await act('save', () => call<LedgerConnection>('ledger.configure', { id: configuring!.id, qboBank: qboBank || undefined, confirmBankFeed: confirmFeed }), () => 'Saved');
    if (r) configuring = null;
  }
  async function add() {
    const r = await act('add', () => call<LedgerConnection>('ledger.add', { kind: form.kind, name: form.name, mode: form.mode, token: form.mode === 'live' ? form.token.trim() : undefined, legalEntity: form.kind === 'slash' ? form.legalEntity.trim() || undefined : undefined, confirmBankFeed: form.confirm }),
      (c) => `Added ${c.name}${form.mode === 'live' ? ' — key accepted' : ''}${c.blockers.length ? '; finish setup before activating' : ''}`);
    if (r) { adding = false; form.token = ''; await openConfig(r); }
  }
</script>

<svelte:head><title>Ledgers · Accounting Agent</title></svelte:head>
<header class="page-head">
  <div><h1>Ledgers</h1><p class="sub">The bank and card accounts the agent pulls from, and how each one reaches QuickBooks. {data.ledgers.length} connection{data.ledgers.length === 1 ? '' : 's'}, {active} active.</p></div>
  <div class="actions"><button class="btn primary" type="button" onclick={() => (adding = !adding)}>{adding ? 'Close' : 'Add connection'}</button></div>
</header>

{#if data.error}
  <ErrorState message={data.error.message} source={data.error.source} onretry={() => invalidateAll()} />
{:else}
  <div class="split">
    <section class="list" aria-label="Connections">
      {#if !data.ledgers.length}
        <div class="card empty-state"><span class="ring" aria-hidden="true">+</span><p class="big">No ledgers connected.</p><p class="muted">Add Slash or Mercury and paste its API key. You'll need the key from your Slash or Mercury dashboard — the form links straight to it.</p><button class="btn primary" type="button" onclick={() => (adding = true)}>Add connection</button></div>
      {/if}
      {#each data.ledgers as l (l.id)}
        {@const h = health[l.id]}
        <article class="card conn" class:bad={!!l.lastError || h?.ok === false}>
          <div class="top">
            <span class="avatar" aria-hidden="true">{l.name.slice(0, 2).toUpperCase()}</span><div class="nm"><strong>{l.name}</strong><span class="muted small">{l.kind} · {l.mode === 'live' ? (l.hasCredentials ? 'live · key saved' : 'live · no key') : 'sample data'} · <span class="mono">{l.id}</span></span></div>
            <span class="status"><span class="pill" class:ok={l.status === 'active'}>{l.status === 'active' ? 'Active' : 'Inactive'}</span></span>
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
            <button class="btn sm" type="button" onclick={() => openConfig(l)} disabled={!!busy}>{l.mode === 'live' && l.hasCredentials ? 'Configure' : 'Add API key'}</button>
            <a class="btn sm ghost" href="/queue?connection={l.id}">View its queue</a>
          </div>
        </article>
      {/each}
    </section>

    {#if adding}
      <aside class="card panel" aria-label="Add connection">
        <h2>Add connection</h2>
        <label>Kind <select bind:value={form.kind} onchange={() => (form.name = form.kind === 'slash' ? 'Slash' : 'Mercury')}><option value="mercury">Mercury</option><option value="slash">Slash</option></select></label>
        <label>Name <input bind:value={form.name} /></label>
        <label>Data <select bind:value={form.mode}><option value="live">My real account (API key)</option><option value="fixture">Sample data (try it first)</option></select></label>
        {#if form.mode === 'live'}
          <label>{help.label}
            <input type="password" bind:value={form.token} autocomplete="off" placeholder="Paste the key" aria-describedby="keyhelp" />
          </label>
          <p class="muted small" id="keyhelp">Find it at <a href={help.url} target="_blank" rel="noopener">{help.where} ↗</a>. {help.note} We check it with {form.kind === 'slash' ? 'Slash' : 'Mercury'} before saving, store it encrypted for this company only, and never show it again.</p>
          {#if form.kind === 'slash'}<label>Legal entity id <span class="muted">(optional)</span><input bind:value={form.legalEntity} autocomplete="off" /></label>{/if}
        {/if}
        {#if form.kind === 'mercury'}
          <div class="warn">Mercury can't code transactions for QuickBooks, so approvals are written to QuickBooks directly. If Mercury's own QuickBooks sync or the QuickBooks bank feed also posts these transactions, they are booked twice.</div>
          <label class="check"><input type="checkbox" bind:checked={form.confirm} /> Mercury's QuickBooks sync and the bank feed for these accounts are off, or I will match them</label>
        {/if}
        <button class="btn primary" type="button" onclick={add} disabled={!!busy || !form.name.trim() || (form.mode === 'live' && !form.token.trim())}>{busy === 'add' ? 'Checking key…' : 'Add connection'}</button>
        <p class="muted small">New connections start inactive. Map accounts and activate after adding.</p>
      </aside>
    {:else if configuring}
      <aside class="card panel" aria-label="Configure {configuring.name}">
        <h2>Configure {configuring.name}</h2>
        {#if configuring.keyHelp}
          {@const kh = configuring.keyHelp}
          <div class="keybox">
            <strong>{kh.label}</strong>
            <span class="muted small">{configuring.mode === 'live' && configuring.hasCredentials ? 'Saved (encrypted). Paste a new one to replace it.' : configuring.mode === 'live' ? 'Not set yet.' : 'Using sample data. Paste your key to switch to your real account.'}</span>
            <input type="password" bind:value={newKey} autocomplete="off" placeholder="Paste the key" aria-label={kh.label} />
            {#if configuring.kind === 'slash'}<input bind:value={newEntity} autocomplete="off" placeholder="Legal entity id (optional)" aria-label="Slash legal entity id" />{/if}
            <span class="muted small">Find it at <a href={kh.url} target="_blank" rel="noopener">{kh.where} ↗</a></span>
            <button class="btn sm primary" type="button" onclick={saveKey} disabled={!!busy || !newKey.trim()}>{busy === 'key' ? 'Checking…' : 'Check and save key'}</button>
          </div>
        {/if}
        {#if direct(configuring) && !configuring.ledgerAccounts.length}<p class="err">Could not list {configuring.kind} accounts. Run Test to see why.</p>{/if}
        {#each configuring.ledgerAccounts as a}
          <label>{a.name} → QuickBooks bank account
            <select bind:value={bankMap[a.id]} aria-label="QuickBooks bank account for {a.name}">
              <option value="">Choose…</option>
              {#each configuring.qboBankAccounts as b}<option value={b.id}>{b.name} (QuickBooks #{b.id})</option>{/each}
            </select>
          </label>
        {/each}
        {#if direct(configuring)}
        <div class="warn">Approvals for this ledger are written to QuickBooks directly. Turn off {configuring.kind === 'mercury' ? "Mercury's QuickBooks sync and " : ''}the QuickBooks bank feed for these accounts, or match them, to avoid double-booking.</div>
        <label class="check"><input type="checkbox" bind:checked={confirmFeed} /> Off, or I will match them{configuring.bankFeedConfirmedBy ? ` (confirmed by ${configuring.bankFeedConfirmedBy})` : ''}</label>
        <div class="acts"><button class="btn primary" type="button" onclick={saveConfig} disabled={!!busy}>Save</button><button class="btn" type="button" onclick={() => (configuring = null)}>Cancel</button></div>
        {:else}
        <div class="acts"><button class="btn" type="button" onclick={() => (configuring = null)}>Close</button></div>
        {/if}
      </aside>
    {/if}
  </div>
{/if}

<style>
  .split { display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-start; }
  .list { flex: 999 1 560px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .conn { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; transition: border-color var(--t-fast) var(--ease); }
  .conn:hover { border-color: var(--hair-strong); }
  .conn.bad { border-color: var(--danger-line); }
  .top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .top .avatar { width: 36px; height: 36px; border-radius: 10px; font-size: 12px; }
  .nm { display: flex; flex-direction: column; } .nm strong { font-size: 15px; font-weight: 600; }
  .status { margin-left: auto; }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; font-size: 13.5px; padding: 14px 0; border-top: 1px solid var(--hair-soft); border-bottom: 1px solid var(--hair-soft); }
  .lbl { display: block; color: var(--text-muted); font-size: 12.5px; margin-bottom: 2px; }
  .err { margin: 0; padding: 10px 12px; border-radius: var(--r-1); background: var(--danger-soft); border: 1px solid var(--danger-line); color: var(--danger); font-size: 13px; }
  .ok { margin: 0; padding: 10px 12px; border-radius: var(--r-1); background: var(--ok-soft); border: 1px solid color-mix(in srgb, var(--ok) 30%, transparent); color: var(--ok); font-size: 13px; }
  .blockers { font-size: 13px; padding: 10px 12px; border-radius: var(--r-1); background: var(--warn-soft); border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent); color: var(--warn); }
  .blockers ul { margin: 4px 0 0; padding-left: 18px; }
  .acts { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .panel { flex: 1 1 320px; max-width: 400px; padding: 22px; display: flex; flex-direction: column; gap: 14px; background: var(--raised); border-color: var(--hair-strong); box-shadow: var(--shadow-2); position: sticky; top: 24px; animation: slidein var(--t) var(--ease); }
  @keyframes slidein { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }
  label { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--text-muted); }
  label select, label input:not([type='checkbox']) { height: 36px; padding: 0 10px; font-size: 14px; }
  .check { flex-direction: row; align-items: flex-start; gap: 8px; font-size: 13px; color: var(--text); }
  .warn { padding: 12px 14px; border-radius: var(--r-1); background: var(--warn-soft); border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent); color: var(--warn); font-size: 13px; line-height: 1.45; }
  .small { font-size: 12.5px; margin: 0; }
  .keybox { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: var(--r-1); border: 1px solid var(--hair-strong); background: var(--sunken); }
  .keybox input { height: 36px; padding: 0 10px; font-size: 14px; }
  .keybox .btn { align-self: flex-start; }
</style>
