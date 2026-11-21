<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import ComponentToggle from '$lib/components/ComponentToggle.svelte';
  let { data } = $props();

  let selected = $state<string | null>(null);
  $effect(() => { selected = data.selected; });
  let filter = $state('all');
  let showViews = $state(false);
  const comp = $derived(data.components.find((c) => c.id === selected) ?? null);
  const node = $derived(data.graph?.nodes.find((n) => n.id === selected) ?? null);
  const counts = $derived({
    total: data.components.length,
    off: data.components.filter((c) => c.status === 'off').length,
    degraded: data.components.filter((c) => c.status === 'degraded').length
  });
  const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  const filters = [['all', 'All'], ['agent', 'Agents'], ['rule', 'Rule processes'], ['human', 'Human steps'], ['tool', 'Tools']] as const;
  const Graph = import('$lib/components/SystemGraph.svelte');
</script>

<svelte:head><title>System · Accounting Agent</title></svelte:head>

{#if data.error || !data.graph}
  <ErrorState message={data.error?.message ?? 'No data'} source={data.error?.source} onretry={() => invalidateAll()} />
{:else}
  <div class="bar">
    <div class="filters" role="group" aria-label="Show">
      {#each filters as [k, label]}<button type="button" class="chip" class:on={filter === k} onclick={() => (filter = k)}>{label}</button>{/each}
    </div>
    <label class="views"><input type="checkbox" bind:checked={showViews} /> Show read-only views</label>
    <span class="muted summary">{counts.total} components · {counts.off} off · {counts.degraded} degraded</span>
  </div>
  <div class="split">
    <section class="card graph">
      {#await Graph}
        <div class="loading"><div class="skeleton" style="height: 100%;"></div></div>
      {:then mod}
        <mod.default graph={data.graph} bind:selected {filter} {showViews} />
      {:catch e}
        <ErrorState message={`Graph failed to load: ${e.message}`} />
      {/await}
      <div class="legend" aria-hidden="true"><span class="lg agent">agent</span><span class="lg">process</span><span class="lg human">human step</span><span class="lg tool">tool</span><span class="lg off">off</span><span class="lg degraded">degraded</span></div>
    </section>
    <aside class="card panel" aria-label="Selected component">
      {#if comp}
        <div class="head"><code>{comp.id}</code><span class="kind {comp.kind}">{comp.kind.toUpperCase()}</span></div>
        <p class="sum">{comp.summary}</p>
        <div class="toggle"><span>Active</span><ComponentToggle c={comp} /></div>
        {#if comp.whenOff}<p class="muted small">When off: {comp.whenOff}</p>{/if}
        <dl>
          <dt>Status</dt><dd class="st {comp.status}">{comp.status}</dd>
          {#if comp.tier}<dt>Tier</dt><dd>{comp.tier}</dd>{/if}
          {#if comp.promptVersion}<dt>Prompt</dt><dd>{comp.promptVersion}</dd>{/if}
          {#if comp.target}<dt>Calls</dt><dd>{comp.target}</dd>{/if}
          {#if comp.usedBy.length}<dt>Used by</dt><dd>{comp.usedBy.join(', ')}</dd>{/if}
          {#if comp.writes.length}<dt>Writes</dt><dd>{comp.writes.join(', ')}</dd>{/if}
          <dt>7-day runs</dt><dd>{comp.calls7d}{comp.failures7d ? ` · ${comp.failures7d} failed` : ''}{comp.p95Ms != null ? ` · p95 ${comp.p95Ms} ms` : ''}</dd>
          {#if comp.costUsd7d}<dt>7-day cost</dt><dd>${comp.costUsd7d.toFixed(4)} · {pct(comp.cacheReadShare)} input cached</dd>{/if}
          {#if comp.evalPassRate != null}<dt>Evals</dt><dd>{pct(comp.evalPassRate)} passing</dd>{/if}
          {#if comp.updatedBy}<dt>Changed</dt><dd>{comp.updatedBy} · {comp.updatedAt?.slice(0, 16).replace('T', ' ')}</dd>{/if}
        </dl>
        <a href="/system/processes/{encodeURIComponent(comp.id)}">Open card, state graph and runs →</a>
      {:else if node}
        <div class="head"><code>{node.label}</code><span class="kind">{node.kind.toUpperCase()}</span></div>
        <p class="muted">{node.kind === 'table' ? 'Database table. Writers are the processes with edges into it.' : 'External system reached through the tools pointing at it.'}</p>
      {:else}
        <p class="big">Select a node</p>
        <p class="muted">Click any agent, process or tool to see its state, metrics and on/off switch. Blue = agents (model calls), purple = tools (external APIs), grey strike-through = switched off.</p>
      {/if}
    </aside>
  </div>
{/if}

<style>
  .bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  .filters { display: flex; gap: 6px; flex-wrap: wrap; }
  .summary { margin-left: auto; font-size: 13px; }
  .views { font-size: 13px; display: inline-flex; gap: 6px; align-items: center; color: var(--ink-2); }
  .split { display: flex; gap: 16px; flex-wrap: wrap; }
  .graph { flex: 999 1 600px; min-width: 0; height: calc(100vh - 200px); min-height: 520px; position: relative; overflow: hidden; }
  .loading { height: 100%; padding: 16px; }
  .legend { position: absolute; left: 12px; bottom: 12px; display: flex; gap: 10px; font-size: 11px; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; z-index: 5; flex-wrap: wrap; }
  .lg::before { content: ''; display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; border: 1px solid var(--line-strong); background: var(--surface); }
  .lg.agent::before { background: var(--accent-tint); border-color: var(--accent-solid); } .lg.tool::before { background: color-mix(in srgb, var(--violet) 12%, transparent); border-color: var(--violet); }
  .lg.human::before { border-style: dashed; } .lg.off::before { background: var(--muted-surface); border-color: var(--line); } .lg.degraded::before { border-color: var(--danger); }
  .panel { flex: 1 1 300px; max-width: 380px; padding: 18px; display: flex; flex-direction: column; gap: 10px; align-self: flex-start; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  code { font-family: var(--mono); font-size: 13px; font-weight: 500; word-break: break-all; }
  .kind { padding: 2px 8px; border-radius: 10px; background: var(--line-soft); font-size: 11px; font-weight: 600; }
  .kind.agent { background: var(--accent-tint); color: var(--link); border: 1px solid color-mix(in srgb, var(--accent-solid) 45%, transparent); } .kind.tool { background: color-mix(in srgb, var(--violet) 10%, transparent); color: var(--violet); border: 1px solid color-mix(in srgb, var(--violet) 35%, transparent); }
  .sum { margin: 0; font-size: 13px; color: var(--ink-2); }
  .toggle { display: flex; justify-content: space-between; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; gap: 10px; flex-wrap: wrap; }
  dl { display: grid; grid-template-columns: 96px 1fr; gap: 6px 10px; margin: 0; font-size: 13px; } dt { color: var(--muted); } dd { margin: 0; word-break: break-word; }
  .st.active { color: var(--ok); } .st.off { color: var(--muted); } .st.degraded { color: var(--danger); } .st.idle { color: var(--ink-2); }
  .small { font-size: 12px; margin: 0; } .big { font-size: 15px; font-weight: 500; margin: 0; }
  .panel p { margin: 0; }
</style>
