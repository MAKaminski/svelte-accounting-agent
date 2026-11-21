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
<svelte:head><title>Evals · Accounting Agent</title></svelte:head>
<header class="page-head">
  <div><h1>Evals and precision</h1><p class="sub">Fixed test cases the agent must get right, and how often you agreed with it on real entries.</p></div>
  <div class="actions"><button class="btn primary" type="button" onclick={run} disabled={running}>{running ? 'Running…' : 'Run evals'} <span class="kbd">v</span></button></div>
</header>
{#if running}<div class="bar" role="progressbar" aria-label="Running evals"><div></div></div>{/if}
{#if data.error || !data.summary}
  <ErrorState message={data.error?.message ?? 'No data'} source={data.error?.source} onretry={() => invalidateAll()} />
{:else}
  {@const s = data.summary}
  {@const rate = s.lastRun ? s.lastRun.passed / s.lastRun.total : null}
  {@const maxCost = Math.max(...s.costByWeek.map((w) => w.costUsd), 0.000001)}
  <div class="stats">
    <div class="card stat-tile ringtile">
      <svg viewBox="0 0 64 64" width="64" height="64" role="img" aria-label={rate == null ? 'No run yet' : `${Math.round(rate * 100)}% passing`}>
        <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--a1)" /><stop offset="1" stop-color="var(--a2)" /></linearGradient></defs>
        <circle cx="32" cy="32" r="26" fill="none" stroke="var(--hair-strong)" stroke-width="6" />
        {#if rate != null}<circle cx="32" cy="32" r="26" fill="none" stroke={rate === 1 ? 'var(--ok)' : 'url(#rg)'} stroke-width="6" stroke-linecap="round" stroke-dasharray="{rate * 163.4} 163.4" transform="rotate(-90 32 32)" />{/if}
      </svg>
      <div><span class="n">{s.lastRun ? `${s.lastRun.passed}/${s.lastRun.total}` : '—'}</span><span class="l">Eval cases passing</span><span class="h">{s.lastRun ? `Last run in ${s.lastRun.mode} mode` : `${s.cases.length} cases ready to run`}</span></div>
    </div>
    <div class="card stat-tile"><span class="n">{pct(s.shadow.precision)}</span><span class="l">Agreed with you</span><span class="h">Over {s.shadow.decisions} decisions. Target 95% or higher.</span></div>
    <div class="card stat-tile"><span class="n">{s.shadow.autoApproveWouldHave}</span><span class="l">Could have been auto-approved</span><span class="h">{pct(s.shadow.autoApprovePrecision)} of those were right. Auto-approval stays off until 98% over 200 decisions.</span></div>
  </div>
  <h2 class="section-title">Last run</h2>
  {#if s.lastRun}
    <div class="card list">
      {#each s.lastRun.cases as c}
        <div class="row"><span><span class="pill" class:ok={c.pass} class:bad={!c.pass}>{c.pass ? 'Pass' : 'Fail'}</span></span><span class="muted kind">{c.kind}</span><span>{c.name}</span><span class="muted small">{c.failures.join('; ')}</span><span class="mono muted r">${c.costUsd.toFixed(5)}</span></div>
      {/each}
    </div>
  {:else}<div class="card empty-state"><span class="ring" aria-hidden="true">▶</span><p class="big">No eval run yet</p><p class="muted">{s.cases.length} cases are ready. Run them to check the agent before trusting a prompt or model change.</p><button class="btn" type="button" onclick={run} disabled={running}>Run evals</button></div>{/if}
  <h2 class="section-title">Model cost by week</h2>
  {#if s.costByWeek.length}
    <div class="card list">
      <div class="row wk head"><span>Week</span><span class="r">Calls</span><span class="r">Cost</span><span></span><span class="r">Read from cache</span></div>
      {#each s.costByWeek as w}
        <div class="row wk"><span class="mono">{w.week}</span><span class="mono r">{w.calls}</span><span class="mono r">${w.costUsd.toFixed(4)}</span>
          <span class="costbar" aria-hidden="true"><i style="width: {Math.max(2, (w.costUsd / maxCost) * 100)}%"></i></span>
          <span class="mono r" class:warnc={w.cacheReadShare !== null && w.cacheReadShare < 0.5}>{pct(w.cacheReadShare)}</span></div>
      {/each}
    </div>
  {:else}<div class="card empty-state"><p class="muted">No model calls yet.</p></div>{/if}
{/if}
<style>
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
  .ringtile { flex-direction: row; align-items: center; gap: 16px; } .ringtile div { display: flex; flex-direction: column; gap: 4px; }
  .list { padding: 4px 20px; overflow-x: auto; }
  .row { display: grid; grid-template-columns: 70px 70px minmax(200px, 1.5fr) minmax(140px, 2fr) 90px; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--hair-soft); align-items: center; min-width: 640px; }
  .row:last-child { border-bottom: 0; }
  .row.wk { grid-template-columns: 110px 70px 90px minmax(120px, 1fr) 130px; }
  .row.head { font-size: 12.5px; color: var(--text-muted); }
  .kind { text-transform: capitalize; } .r { text-align: right; }
  .costbar { height: 6px; border-radius: 3px; background: var(--hair); overflow: hidden; } .costbar i { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--a1), var(--a2)); }
  .small { font-size: 12.5px; } .warnc { color: var(--warn); }
  .bar { height: 3px; background: var(--hair); border-radius: 2px; overflow: hidden; margin-bottom: 12px; } .bar div { height: 100%; width: 40%; background: var(--grad); animation: slide 1.1s infinite ease-in-out; }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
</style>
