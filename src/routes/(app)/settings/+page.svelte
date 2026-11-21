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
<h1>Settings</h1>
{#if data.error || !data.s}
  <ErrorState message={data.error?.message ?? 'No data'} source={data.error?.source} onretry={() => invalidateAll()} />
{:else}
  {@const s = data.s}
  <div class="grid">
    <section class="card pane">
      <h2>Slash</h2>
      <dl><dt>Mode</dt><dd>{s.slashMode}</dd><dt>API key</dt><dd>{s.slashKeyPresent ? 'set' : 'not set'}</dd><dt>Legal entity</dt><dd>{s.legalEntityPresent ? 'set' : 'not set'}</dd><dt>Accounts</dt><dd>{s.accounts}</dd><dt>Last pull</dt><dd>{s.lastPullAt ?? 'never'}</dd></dl>
      <p class="muted small">Key: Slash dashboard → Settings → Developer. Put it in <code>.env</code> as SLASH_API_KEY, then set SLASH_MODE=live.</p>
      <button class="btn" type="button" onclick={coa} disabled={!!busy}>{busy === 'coa' ? 'Pulling…' : 'Pull chart of accounts'}</button>
    </section>
    <section class="card pane">
      <h2>QuickBooks (read-only)</h2>
      <dl><dt>Mode</dt><dd>{s.qboMode}</dd><dt>Connected</dt><dd>{s.qboConnected ? 'yes' : 'no'}</dd></dl>
      <p class="muted small">Slash writes to QuickBooks; this app only reads vendor history.</p>
      {#if s.qboMode === 'live'}<a class="btn" href="/api/qbo/connect">Connect QuickBooks</a>{/if}
    </section>
    <section class="card pane">
      <h2>Models</h2>
      <dl><dt>Mode</dt><dd>{s.modelMode}</dd><dt>Worker</dt><dd>{s.modelWorker}</dd><dt>Payout splits</dt><dd>{s.modelIntegrator}</dd><dt>Ollama</dt><dd>{s.ollama ? 'on (merchant identify)' : 'off'}</dd></dl>
    </section>
    <section class="card pane">
      <h2>Whatnot payouts</h2>
      <p class="muted small">CSV columns: payout_id, date, gross, fees, shipping, net.</p>
      <label class="btn" class:disabled={!!busy}>{busy === 'csv' ? 'Importing…' : 'Upload payout CSV'}<input class="sr-only" type="file" accept=".csv,text/csv" onchange={upload} /></label>
    </section>
    <section class="card pane">
      <h2>App</h2>
      <dl><dt>Sign-in</dt><dd>{s.devBypass ? 'Dev bypass — everyone is owner@local (no Google credentials set)' : 'Google, invite-only'}</dd><dt>Auto pull</dt><dd>{s.pullIntervalMin ? `every ${s.pullIntervalMin} min` : 'off'}</dd><dt>Undo window</dt><dd>{s.undoWindowMs / 1000} s</dd></dl>
    </section>
  </div>
{/if}
<style>
  h1 { margin: 0 0 16px; font-size: 22px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
  .pane { padding: 20px; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
  h2 { margin: 0; font-size: 15px; }
  dl { display: grid; grid-template-columns: 110px 1fr; gap: 6px 12px; margin: 0; font-size: 13px; } dt { color: var(--muted); } dd { margin: 0; }
  .small { font-size: 12px; margin: 0; } code { font-family: var(--mono); font-size: 12px; }
</style>
