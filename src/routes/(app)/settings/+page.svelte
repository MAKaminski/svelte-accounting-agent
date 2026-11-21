<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { call } from '$lib/client';
  import { ui } from '$lib/ui.svelte';
  import ErrorState from '$lib/components/ErrorState.svelte';
  let { data } = $props();
  let busy = $state<string | null>(null);

  async function coa() {
    busy = 'coa';
    try { const r = await call<{ accounts: unknown[] }>('coa.pull'); ui.toast(`${r.accounts.length} accounts pulled from Slash`); await invalidateAll(); }
    catch (e) { ui.toast((e as Error).message, { kind: 'error' }); } finally { busy = null; }
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
<header class="page-head"><div><h1>Settings</h1><p class="sub">Where data comes from, which models are used, and how the app behaves. Keys and modes are set on the server.</p></div></header>
{#if data.error || !data.s}
  <ErrorState message={data.error?.message ?? 'No data'} source={data.error?.source} onretry={() => invalidateAll()} />
{:else}
  {@const s = data.s}
  <div class="grid">
    <section class="card pane">
      <h2>Slash</h2>
      <dl><dt>Data</dt><dd><span class="pill" class:ok={s.slashMode === 'live'}>{s.slashMode === 'live' ? 'Live' : 'Demo data'}</span></dd><dt>API key</dt><dd>{s.slashKeyPresent ? 'Set' : 'Not set'}</dd><dt>Legal entity</dt><dd>{s.legalEntityPresent ? 'Set' : 'Not set'}</dd><dt>Accounts</dt><dd>{s.accounts}</dd><dt>Last pull</dt><dd>{s.lastPullAt ? s.lastPullAt.slice(0, 16).replace('T', ' ') : 'Never'}</dd></dl>
      <p class="muted small">Key: Slash dashboard → Settings → Developer. Put it in <code>.env</code> as SLASH_API_KEY, then set SLASH_MODE=live.</p>
      <button class="btn" type="button" onclick={coa} disabled={!!busy}>{busy === 'coa' ? 'Pulling…' : 'Pull chart of accounts'}</button>
    </section>
    <section class="card pane">
      <h2>QuickBooks</h2>
      <dl><dt>Data</dt><dd><span class="pill" class:ok={s.qboMode === 'live'}>{s.qboMode === 'live' ? 'Live' : 'Demo data'}</span></dd><dt>Connected</dt><dd>{s.qboConnected ? 'Yes' : 'No'}</dd></dl>
      <p class="muted small">Read for vendor history and accounts. Written only for ledgers that can't code for QuickBooks themselves (Mercury), after your approval.</p>
      {#if s.qboMode === 'live'}<a class="btn" href="/api/qbo/connect">Connect QuickBooks</a>{/if}
    </section>
    <section class="card pane">
      <h2>Models</h2>
      <dl><dt>Calls</dt><dd><span class="pill" class:ok={s.modelMode === 'live'}>{s.modelMode === 'live' ? 'Live' : 'Demo answers'}</span></dd><dt>Everyday</dt><dd>{s.modelWorker}</dd><dt>Payout splits</dt><dd>{s.modelIntegrator}</dd><dt>Local model</dt><dd>{s.ollama ? 'On, for identifying merchants' : 'Off'}</dd></dl>
    </section>
    <section class="card pane">
      <h2>Whatnot payouts</h2>
      <p class="muted small">CSV columns: payout_id, date, gross, fees, shipping, net.</p>
      <label class="btn" class:disabled={!!busy}>{busy === 'csv' ? 'Importing…' : 'Upload payout CSV'}<input class="sr-only" type="file" accept=".csv,text/csv" onchange={upload} /></label>
    </section>
    <section class="card pane">
      <h2>App</h2>
      <dl><dt>Sign-in</dt><dd>{s.devBypass ? 'Local bypass: everyone is owner@local' : 'Google, invite only'}</dd><dt>Auto pull</dt><dd>{s.pullIntervalMin ? `Every ${s.pullIntervalMin} min` : 'Off'}</dd><dt>Undo window</dt><dd>{s.undoWindowMs / 1000} seconds</dd></dl>
    </section>
  </div>
{/if}
<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; align-items: start; }
  .pane { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; align-items: flex-start; }
  dl { display: grid; grid-template-columns: 110px 1fr; gap: 10px 12px; margin: 0; font-size: 13.5px; width: 100%; } dt { color: var(--text-muted); } dd { margin: 0; }
  .small { font-size: 12.5px; margin: 0; } code { font-family: var(--mono); font-size: 12px; }
</style>
