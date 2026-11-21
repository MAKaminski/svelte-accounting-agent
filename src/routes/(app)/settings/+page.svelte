<script lang="ts">
  import { invalidate, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { call } from '$lib/client';
  import { ui } from '$lib/ui.svelte';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import SetupChecklist from '$lib/components/SetupChecklist.svelte';
  let { data } = $props();
  let busy = $state<string | null>(null);
  const owner = $derived(page.data.me?.role === 'owner');
  let form = $state({ name: '', business: '', codingRules: '' });
  $effect(() => { if (data.company) form = { name: data.company.name, business: data.company.business, codingRules: data.company.codingRules }; });
  const qboFlash = page.url.searchParams.get('qbo');
  $effect(() => { if (qboFlash === 'connected') ui.toast('QuickBooks connected. Pull your chart of accounts next.'); else if (qboFlash === 'cancelled') ui.toast('QuickBooks sign-in was cancelled', { kind: 'error' }); });

  async function save() {
    busy = 'company';
    try { await call('company.update', { name: form.name, business: form.business, codingRules: form.codingRules }); ui.toast('Company saved. The agent uses it from the next recommendation.'); await invalidateAll(); }
    catch (e) { ui.toast((e as Error).message, { kind: 'error' }); } finally { busy = null; }
  }
  async function coa() {
    busy = 'coa';
    try { const r = await call<{ accounts: unknown[] }>('coa.pull'); ui.toast(`${r.accounts.length} accounts pulled`); await invalidate('app:company'); }
    catch (e) { ui.toast((e as Error).message, { kind: 'error', ms: 8000 }); } finally { busy = null; }
  }
  async function upload(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    busy = 'csv';
    try { const r = await call<{ imported: number }>('payouts.import', { file: await f.text(), channel: 'whatnot' }); ui.toast(`Imported ${r.imported} payout rows; matching deposits re-recommended`); }
    catch (e) { ui.toast((e as Error).message, { kind: 'error', ms: 8000 }); } finally { busy = null; (ev.target as HTMLInputElement).value = ''; }
  }
</script>
<svelte:head><title>Settings · Accounting Agent</title></svelte:head>
<header class="page-head"><div><h1>Settings</h1><p class="sub">Your company, QuickBooks, and how the agent works. Bank and card ledgers (and their API keys) live under <a href="/ledgers">Ledgers</a>.</p></div></header>
{#if data.error || !data.s || !data.company}
  <ErrorState message={data.error?.message ?? 'No data'} source={data.error?.source} onretry={() => invalidateAll()} />
{:else}
  {@const s = data.s}
  {@const c = data.company}
  <div class="col">
    <SetupChecklist steps={c.setup} />
    <div class="grid">
      <section class="card pane wide" id="company" aria-label="Company">
        <div class="ph"><h2>Company</h2>{#if c.sampleData}<span class="pill">Demo company · sample data</span>{/if}</div>
        <label>Name <input bind:value={form.name} maxlength="120" disabled={!owner} /></label>
        <label>What it does <span class="muted">— the agent reads this to judge what each purchase is for</span>
          <textarea bind:value={form.business} rows="3" maxlength="600" disabled={!owner}></textarea></label>
        <label>Coding rules <span class="muted">— one per line, e.g. "Shipping labels → Shipping & Postage". Use your QuickBooks account names.</span>
          <textarea class="mono" bind:value={form.codingRules} rows="9" maxlength="3000" disabled={!owner}></textarea></label>
        {#if owner}<button class="btn primary" type="button" onclick={save} disabled={!!busy || !form.name.trim()}>{busy === 'company' ? 'Saving…' : 'Save'}</button>
        {:else}<p class="muted small">Only owners can edit the company.</p>{/if}
      </section>
      <section class="card pane" id="quickbooks" aria-label="QuickBooks">
        <h2>QuickBooks</h2>
        <dl>
          <dt>Status</dt><dd>
            {#if c.sampleData && !s.qboConnected}<span class="pill">Demo data</span>
            {:else if s.qboConnected && s.qboMode === 'live'}<span class="pill ok">Connected</span>
            {:else if s.qboMode === 'live'}<span class="pill warn">Not connected</span>
            {:else}<span class="pill">Demo data (server in fixture mode)</span>{/if}</dd>
          <dt>Accounts</dt><dd>{s.accounts ? `${s.accounts} pulled` : 'None yet'}</dd>
          <dt>Last pull</dt><dd>{s.lastPullAt ? s.lastPullAt.slice(0, 16).replace('T', ' ') : 'Never'}</dd>
        </dl>
        <p class="muted small">You sign in to QuickBooks Online with your own Intuit login; the app never sees your password. It reads your accounts and vendor history, and writes only entries you approved, for ledgers that can't sync to QuickBooks themselves (Mercury).</p>
        <div class="row">
          {#if s.qboMode === 'live' && s.qboOAuth && owner}<a class="btn primary" href="/api/qbo/connect">{s.qboConnected ? 'Reconnect QuickBooks' : 'Connect QuickBooks'}</a>{/if}
          <button class="btn" type="button" onclick={coa} disabled={!!busy}>{busy === 'coa' ? 'Pulling…' : 'Pull chart of accounts'}</button>
        </div>
        {#if s.qboMode === 'live' && !s.qboOAuth}<p class="warn-text small">QuickBooks sign-in isn't set up on this server yet (the operator adds the Intuit app keys — see docs/self-host.md).</p>{/if}
      </section>
      <section class="card pane">
        <h2>Ledgers</h2>
        <p class="muted small">Where transactions come from. Add Slash or Mercury and paste its API key; the key is checked with the ledger, stored encrypted for this company only, and never shown again.</p>
        <a class="btn" href="/ledgers">Manage ledgers and keys</a>
      </section>
      <section class="card pane">
        <h2>Models</h2>
        <dl><dt>Calls</dt><dd><span class="pill" class:ok={s.modelMode === 'live'}>{s.modelMode === 'live' ? 'Live' : 'Demo answers'}</span></dd><dt>Everyday</dt><dd>{s.modelWorker}</dd><dt>Payout splits</dt><dd>{s.modelIntegrator}</dd><dt>Local model</dt><dd>{s.ollama ? 'On, for identifying merchants' : 'Off'}</dd></dl>
      </section>
      <section class="card pane">
        <h2>Marketplace payouts</h2>
        <p class="muted small">Optional. Upload a payout report so deposits are split into sales, fees and shipping. CSV columns: payout_id, date, gross, fees, shipping, net.</p>
        <label class="btn" class:disabled={!!busy}>{busy === 'csv' ? 'Importing…' : 'Upload payout CSV'}<input class="sr-only" type="file" accept=".csv,text/csv" onchange={upload} /></label>
      </section>
      <section class="card pane">
        <h2>App</h2>
        <dl><dt>Sign-in</dt><dd>{s.devBypass ? 'Local bypass: everyone is owner@local' : s.signupOpen ? 'Google, open sign-up' : 'Google, invite only'}</dd><dt>Auto pull</dt><dd>{s.pullIntervalMin ? `Every ${s.pullIntervalMin} min` : 'Off'}</dd><dt>Undo window</dt><dd>{s.undoWindowMs / 1000} seconds</dd></dl>
        <a class="link small" href="/welcome">Create another company</a>
      </section>
    </div>
  </div>
{/if}
<style>
  .col { display: flex; flex-direction: column; gap: 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; align-items: start; }
  .wide { grid-column: 1 / -1; }
  .pane { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; align-items: flex-start; }
  .ph { display: flex; gap: 10px; align-items: center; }
  h2 { margin: 0; font-size: 15px; }
  label { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; font-weight: 500; width: 100%; }
  label .muted { font-weight: 400; font-size: 12.5px; }
  input, textarea { font: inherit; font-size: 13.5px; padding: 8px 10px; border-radius: var(--r-1); border: 1px solid var(--hair-strong); background: var(--sunken); color: var(--text); resize: vertical; width: 100%; box-sizing: border-box; }
  textarea.mono { font-family: var(--mono); font-size: 12.5px; line-height: 1.5; }
  dl { display: grid; grid-template-columns: 110px 1fr; gap: 10px 12px; margin: 0; font-size: 13.5px; width: 100%; } dt { color: var(--text-muted); } dd { margin: 0; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .small { font-size: 12.5px; margin: 0; }
  .warn-text { color: var(--warn); }
  .link { color: var(--text-muted); }
</style>
