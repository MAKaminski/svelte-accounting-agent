<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import ComponentToggle from '$lib/components/ComponentToggle.svelte';
  let { data } = $props();
  const agents = $derived(data.components.filter((c) => c.kind === 'agent'));
  const procs = $derived(data.components.filter((c) => c.kind !== 'agent').sort((a, b) => a.layer.localeCompare(b.layer) || a.id.localeCompare(b.id)));
  const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);
</script>

<svelte:head><title>Agents · System · LaceLuxx Books</title></svelte:head>
{#if data.error}
  <ErrorState message={data.error.message} source={data.error.source} onretry={() => invalidateAll()} />
{:else}
  <h2>Agents <span class="muted thin">· steps where a model decides</span></h2>
  <div class="card list">
    <div class="row head a"><span>Agent</span><span>Tier</span><span>Prompt</span><span>Evals</span><span>7-day runs · p95</span><span>7-day cost · cached</span><span>Active</span></div>
    {#each agents as c (c.id)}
      <div class="row a" class:off={!c.enabled}>
        <a class="mono" href="/system/processes/{c.id}">{c.id}</a>
        <span class="small">{c.tier}</span><span class="mono small">{c.promptVersion}</span><span>{pct(c.evalPassRate)}</span>
        <span>{c.calls7d}{c.p95Ms != null ? ` · ${c.p95Ms} ms` : ''}</span>
        <span>{c.costUsd7d ? `$${c.costUsd7d.toFixed(4)} · ${pct(c.cacheReadShare)}` : '$0'}</span>
        <ComponentToggle {c} />
      </div>
    {/each}
  </div>

  <h2>Processes <span class="muted thin">· rules (code) and human steps</span></h2>
  <div class="card list">
    <div class="row head p"><span>Process</span><span>Kind</span><span>Status</span><span>7-day runs · p95</span><span>Writes</span><span>Active</span></div>
    {#each procs as c (c.id)}
      <div class="row p" class:off={!c.enabled}>
        <a class="mono" href="/system/processes/{c.id}">{c.id}</a>
        <span>{c.kind}</span><span class="st {c.status}">{c.status}</span>
        <span>{c.calls7d}{c.failures7d ? ` (${c.failures7d} failed)` : ''}{c.p95Ms != null ? ` · ${c.p95Ms} ms` : ''}</span>
        <span class="small muted">{c.writes.join(', ') || '—'}</span>
        <ComponentToggle {c} />
      </div>
    {/each}
  </div>
{/if}

<style>
  h2 { font-size: 15px; margin: 8px 0 8px; } .thin { font-weight: 400; }
  .list { padding: 4px 16px; overflow-x: auto; margin-bottom: 20px; }
  .row { display: grid; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line-soft); align-items: center; }
  .row.a { grid-template-columns: minmax(170px, 1.2fr) minmax(170px, 1.4fr) 100px 60px 120px 150px 150px; min-width: 980px; }
  .row.p { grid-template-columns: minmax(180px, 1.3fr) 70px 80px 160px minmax(160px, 1.3fr) 150px; min-width: 860px; }
  .row.head { font-size: 12px; color: var(--muted); }
  .row.off a { color: var(--muted); text-decoration: line-through; }
  .mono { font-family: var(--mono); font-size: 12px; } .small { font-size: 12px; }
  .st.active { color: var(--ok); } .st.off { color: var(--muted); } .st.degraded { color: var(--danger); }
</style>
