<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import ComponentToggle from '$lib/components/ComponentToggle.svelte';
  let { data } = $props();
  const byTarget = $derived([...new Set(data.tools.map((t) => t.target ?? 'other'))].map((target) => ({ target, tools: data.tools.filter((t) => (t.target ?? 'other') === target) })));
</script>

<svelte:head><title>Tools · System · Accounting Agent</title></svelte:head>
{#if data.error}
  <ErrorState message={data.error.message} source={data.error.source} onretry={() => invalidateAll()} />
{:else if !data.tools.length}
  <div class="card empty"><p>No tools registered. Add them under <code>tools:</code> in processes.yaml.</p></div>
{:else}
  <p class="muted lead">Tools are the operations agents and processes use on external systems. A failing health check turns a tool red; everything else keeps working.</p>
  <div class="grid">
    {#each byTarget as g}
      <section class="card group">
        <h2>{g.target}</h2>
        {#each g.tools as t (t.id)}
          <div class="tool" class:bad={t.status === 'degraded'} class:off={!t.enabled}>
            <div class="top"><a class="mono" href="/system/processes/{t.id}">{t.id}</a><ComponentToggle c={t} /></div>
            <span class="small">{t.summary}</span>
            <span class="small muted">Used by {t.usedBy.join(', ')}</span>
            <span class="small">Health: <span class="st {t.status}">{t.status}</span> · {t.calls7d} runs{t.failures7d ? ` · ${t.failures7d} upstream failures` : ''}</span>
          </div>
        {/each}
      </section>
    {/each}
  </div>
{/if}

<style>
  .lead { margin: 0 0 14px; max-width: 75ch; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
  .group { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  h2 { margin: 0; font-size: 15px; }
  .tool { border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
  .tool.bad { border-color: var(--danger); background: var(--danger-soft); }
  .tool.off .mono { color: var(--muted); text-decoration: line-through; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap; }
  .mono { font-family: var(--mono); font-size: 12px; font-weight: 500; } .small { font-size: 12px; }
  .st.active { color: var(--ok); } .st.off { color: var(--muted); } .st.degraded { color: var(--danger); }
  .empty { padding: 32px; } code { font-family: var(--mono); }
</style>
