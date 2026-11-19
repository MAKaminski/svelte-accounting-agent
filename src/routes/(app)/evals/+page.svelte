<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { call } from '$lib/client';
  import { ui } from '$lib/ui.svelte';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import type { EvalRun } from '$lib/types';
  let { data } = $props();
  let running = $state(false);
  const pct = (x: number | null | undefined) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);

  async function run() {
    running = true;
    try { const r = await call<EvalRun>('evals.run'); ui.toast(`Evals: ${r.passed}/${r.total} passed`, { kind: r.passed === r.total ? 'ok' : 'error' }); await invalidateAll(); }
    catch (e) { ui.toast((e as Error).message, { kind: 'error' }); }
    finally { running = false; }
  }
  function onKey(ev: KeyboardEvent) { if (ev.key === 'v' && !running && !ui.paletteOpen && !(ev.target instanceof HTMLInputElement)) run(); }
</script>
<svelte:window onkeydown={onKey} />
<svelte:head><title>Evals · LaceLuxx Books</title></svelte:head>
<header><h1>Evals &amp; precision</h1><button class="btn dark" type="button" onclick={run} disabled={running}>{running ? 'Running…' : 'Run evals'} <span class="kbd">v</span></button></header>
{#if running}<div class="bar" role="progressbar" aria-label="Running evals"><div></div></div>{/if}
{#if data.error || !data.summary}
  <ErrorState message={data.error?.message ?? 'No data'} source={data.error?.source} onretry={() => invalidateAll()} />
{:else}
  {@const s = data.summary}
  <div class="stats">
    <div class="card stat"><span class="n">{s.lastRun ? `${s.lastRun.passed}/${s.lastRun.total}` : '—'}</span><span class="muted">Eval cases passing{s.lastRun ? ` (${s.lastRun.mode})` : ''}</span></div>
    <div class="card stat"><span class="n">{pct(s.shadow.precision)}</span><span class="muted">Shadow precision over {s.shadow.decisions} decisions (target ≥ 95%)</span></div>
    <div class="card stat"><span class="n">{s.shadow.autoApproveWouldHave}</span><span class="muted">Would auto-approve at the threshold · {pct(s.shadow.autoApprovePrecision)} precise (needs ≥ 98% after 200+ decisions)</span></div>
  </div>
  <h2>Last run</h2>
  {#if s.lastRun}
    <div class="card list">
      {#each s.lastRun.cases as c}
        <div class="row"><span class="res" class:pass={c.pass}>{c.pass ? 'PASS' : 'FAIL'}</span><span class="muted">{c.kind}</span><span>{c.name}</span><span class="muted small">{c.failures.join('; ')}</span><span class="mono muted">${c.costUsd.toFixed(5)}</span></div>
      {/each}
    </div>
  {:else}<div class="card empty"><p>No eval run yet. {s.cases.length} cases are seeded — press Run evals.</p></div>{/if}
  <h2>Cost by week</h2>
  {#if s.costByWeek.length}
    <div class="card list">
      <div class="row head"><span>Week</span><span>Calls</span><span>Cost</span><span>Input read from cache</span><span></span></div>
      {#each s.costByWeek as w}<div class="row"><span class="mono">{w.week}</span><span>{w.calls}</span><span class="mono">${w.costUsd.toFixed(4)}</span><span class:warnc={w.cacheReadShare !== null && w.cacheReadShare < 0.5}>{pct(w.cacheReadShare)}</span><span></span></div>{/each}
    </div>
  {:else}<div class="card empty"><p>No recommendations yet.</p></div>{/if}
{/if}
<style>
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; } h1 { margin: 0; font-size: 22px; } header .btn { margin-left: auto; }
  h2 { font-size: 15px; margin: 24px 0 8px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .stat { padding: 18px; display: flex; flex-direction: column; gap: 6px; } .n { font-size: 28px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .list { padding: 4px 16px; overflow-x: auto; }
  .row { display: grid; grid-template-columns: 60px 70px minmax(200px, 1.5fr) minmax(160px, 2fr) 90px; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line-soft); align-items: center; min-width: 640px; }
  .row.head { font-size: 12px; color: var(--muted); }
  .res { font-weight: 600; color: var(--danger); font-size: 12px; } .res.pass { color: var(--ok); }
  .small { font-size: 12px; } .warnc { color: var(--warn); }
  .empty { padding: 24px; } .empty p { margin: 0; }
  .bar { height: 3px; background: var(--line); border-radius: 2px; overflow: hidden; margin-bottom: 12px; } .bar div { height: 100%; width: 40%; background: var(--accent); animation: slide 1.1s infinite ease-in-out; }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
</style>
