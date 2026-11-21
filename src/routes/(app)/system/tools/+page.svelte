<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import ComponentToggle from '$lib/components/ComponentToggle.svelte';
  import { friendly } from '$lib/names';
  let { data } = $props();
  const byTarget = $derived([...new Set(data.tools.map((t) => t.target ?? 'other'))].map((target) => ({ target, tools: data.tools.filter((t) => (t.target ?? 'other') === target) })));
</script>

<svelte:head><title>Tools · System · Accounting Agent</title></svelte:head>
{#if data.error}
  <ErrorState message={data.error.message} source={data.error.source} onretry={() => invalidateAll()} />
{:else if !data.tools.length}
  <div class="card empty-state"><p>No tools registered. Add them under <code>tools:</code> in processes.yaml.</p></div>
{:else}
  <p class="muted lead">Tools are how the agent reaches outside systems. If one fails its health check it turns red; everything else keeps working.</p>
  <div class="grid">
    {#each byTarget as g}
      <section class="card group">
        <h2>{g.target}</h2>
        {#each g.tools as t (t.id)}
          <div class="tool" class:bad={t.status === 'degraded'} class:off={!t.enabled}>
            <div class="top"><a class="nm" href="/system/processes/{t.id}"><span>{friendly(t.id)}</span><code>{t.id}</code></a><ComponentToggle c={t} /></div>
            <span class="small">{t.summary}</span>
            <span class="small muted">Used by {t.usedBy.map(friendly).join(', ')}</span>
            <span class="small"><span class="pill" class:ok={t.status === 'active'} class:bad={t.status === 'degraded'}>{t.status}</span> {t.calls7d} runs{t.failures7d ? ` · ${t.failures7d} upstream failures` : ''}</span>
          </div>
        {/each}
      </section>
    {/each}
  </div>
{/if}

<style>
  .lead { margin: 0 0 16px; max-width: 75ch; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; align-items: start; }
  .group { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
  .tool { border: 1px solid var(--hair); border-radius: var(--r-1); background: var(--raised); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
  .tool.bad { border-color: var(--danger-line); background: var(--danger-soft); }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap; }
  .nm { display: flex; flex-direction: column; text-decoration: none; color: var(--text); } .nm span { font-weight: 500; } .nm:hover span { text-decoration: underline; }
  .nm code { font-family: var(--mono); font-size: 11.5px; color: var(--text-muted); }
  .tool.off .nm span { color: var(--text-muted); text-decoration: line-through; }
  .small { font-size: 12.5px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  code { font-family: var(--mono); }
</style>
