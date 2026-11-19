<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import ComponentToggle from '$lib/components/ComponentToggle.svelte';
  import StateGraph from '$lib/components/StateGraph.svelte';
  let { data } = $props();
</script>

<svelte:head><title>{data.c?.id ?? 'Component'} · System · LaceLuxx Books</title></svelte:head>
<a class="back" href="/system?c={data.c?.id ?? ''}">← Graph</a>
{#if data.error || !data.c}
  <ErrorState message={data.error?.message ?? 'Not found'} source={data.error?.source} onretry={() => invalidateAll()} />
{:else}
  {@const c = data.c}
  <div class="title">
    <h2><code>{c.id}</code></h2><span class="kind {c.kind}">{c.kind.toUpperCase()}</span><span class="st {c.status}">{c.status}</span>
    <div class="push"><ComponentToggle {c} /></div>
  </div>
  {#if c.whenOff}<p class="muted">When off: {c.whenOff}</p>{:else}<p class="muted">Required: this component cannot be switched off.</p>{/if}

  <section class="card pane">
    <h3>Live state graph <span class="muted thin">· entries per state now; highlighted transitions are caused by {c.kind === 'tool' ? 'processes using this tool' : 'this process'}</span></h3>
    <StateGraph counts={c.stateCounts} transitions={c.transitions} />
  </section>

  <div class="grid">
    <section class="card pane">
      <h3>{c.card ? 'Process card' : 'Tool'}</h3>
      {#if c.card}
        <dl>
          <dt>Trigger</dt><dd>{c.card.trigger}</dd>
          <dt>Input</dt><dd>{c.card.input}</dd>
          <dt>Processing</dt><dd><ol>{#each c.card.steps as s}<li><strong>{s.kind}</strong>{s.tier ? ` (${s.tier})` : ''}: {s.does}{s.evals ? ` — evals: ${s.evals.join(', ')}` : ''}</li>{/each}</ol></dd>
          <dt>Output</dt><dd>{c.card.output}</dd>
          <dt>Fails as</dt><dd>{c.card.fails}</dd>
          <dt>Accept</dt><dd>{c.card.accept}</dd>
          <dt>Budget</dt><dd>p95 {c.card.budget.p95_ms} ms · ${c.card.budget.usd} per run</dd>
        </dl>
      {:else if c.tool}
        <dl><dt>Port</dt><dd>{c.tool.port}</dd><dt>Operations</dt><dd>{c.tool.ops.join(', ')}</dd><dt>Target</dt><dd>{c.target}</dd><dt>Used by</dt><dd>{c.usedBy.join(', ')}</dd></dl>
      {/if}
      <p class="small muted">In use cases: {c.traces.join(' · ') || '—'}</p>
    </section>
    <section class="card pane">
      <h3>Recent runs <span class="muted thin">· {c.calls7d} in 7 days{c.p95Ms != null ? `, p95 ${c.p95Ms} ms` : ''}</span></h3>
      {#if !c.runs.length}
        <p class="muted">No runs yet{c.kind === 'tool' ? ' (tool runs are counted on the processes that use it).' : '.'}</p>
      {:else}
        <div class="runs">
          {#each c.runs as r}
            <div class="run" class:bad={r.status === 'failed'}>
              <span class="mono">{r.startedAt.slice(5, 19).replace('T', ' ')}</span>
              <span>{r.status}</span><span class="mono">{r.e2eMs != null ? `${r.e2eMs} ms` : ''}</span>
              <span class="small muted">{r.error ?? (r.subjectId ? r.subjectId : '')}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .back { font-size: 13px; text-decoration: none; }
  .title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 10px 0 4px; }
  h2 { margin: 0; font-size: 18px; } code { font-family: var(--mono); }
  .push { margin-left: auto; }
  .kind { padding: 2px 8px; border-radius: 10px; background: var(--line-soft); font-size: 11px; font-weight: 600; }
  .kind.agent { background: #dbeafe; color: #1e3a8a; } .kind.tool { background: #ede9fe; color: #5b21b6; }
  .st { font-size: 13px; } .st.active { color: var(--ok); } .st.off { color: var(--muted); } .st.degraded { color: var(--danger); }
  .pane { padding: 18px; display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
  h3 { margin: 0; font-size: 15px; } .thin { font-weight: 400; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 16px; }
  dl { display: grid; grid-template-columns: 90px 1fr; gap: 8px 12px; margin: 0; font-size: 13px; } dt { color: var(--muted); } dd { margin: 0; }
  ol { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
  .runs { display: flex; flex-direction: column; max-height: 360px; overflow: auto; }
  .run { display: grid; grid-template-columns: 120px 60px 70px 1fr; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--line-soft); font-size: 13px; }
  .run.bad { color: var(--danger); }
  .mono { font-family: var(--mono); font-size: 12px; } .small { font-size: 12px; } p { margin: 0; }
</style>
