<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import ComponentToggle from '$lib/components/ComponentToggle.svelte';
  import { friendly } from '$lib/names';
  let { data } = $props();
  const agents = $derived(data.components.filter((c) => c.kind === 'agent'));
  const procs = $derived(data.components.filter((c) => c.kind !== 'agent').sort((a, b) => a.layer.localeCompare(b.layer) || a.id.localeCompare(b.id)));
  const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);
</script>

<svelte:head><title>Agents · System · Accounting Agent</title></svelte:head>
{#if data.error}
  <ErrorState message={data.error.message} source={data.error.source} onretry={() => invalidateAll()} />
{:else}
  <h2 class="section-title first">Agents <span class="muted thin">where a model decides</span></h2>
  <div class="card list">
    <div class="row head a"><span>Agent</span><span>Tier</span><span>Prompt</span><span>Evals</span><span>7-day runs · p95</span><span>7-day cost · cached</span><span>Active</span></div>
    {#each agents as c (c.id)}
      <div class="row a" class:off={!c.enabled}>
        <a class="nm" href="/system/processes/{c.id}"><span>{friendly(c.id)}</span><code>{c.id}</code></a>
        <span class="small">{c.tier}</span><span class="mono small">{c.promptVersion}</span><span>{pct(c.evalPassRate)}</span>
        <span>{c.calls7d}{c.p95Ms != null ? ` · ${c.p95Ms} ms` : ''}</span>
        <span>{c.costUsd7d ? `$${c.costUsd7d.toFixed(4)} · ${pct(c.cacheReadShare)}` : '$0'}</span>
        <ComponentToggle {c} />
      </div>
    {/each}
  </div>

  <h2 class="section-title">Rules and your steps <span class="muted thin">plain code and human decisions, no model</span></h2>
  <div class="card list">
    <div class="row head p"><span>Step</span><span>Kind</span><span>Status</span><span>7-day runs · p95</span><span>Writes</span><span>Active</span></div>
    {#each procs as c (c.id)}
      <div class="row p" class:off={!c.enabled}>
        <a class="nm" href="/system/processes/{c.id}"><span>{friendly(c.id)}</span><code>{c.id}</code></a>
        <span class="muted">{c.kind === 'human' ? 'you' : c.kind}</span><span><span class="pill" class:ok={c.status === 'active'} class:bad={c.status === 'degraded'}>{c.status}</span></span>
        <span>{c.calls7d}{c.failures7d ? ` (${c.failures7d} failed)` : ''}{c.p95Ms != null ? ` · ${c.p95Ms} ms` : ''}</span>
        <span class="small muted">{c.writes.join(', ') || '—'}</span>
        <ComponentToggle {c} />
      </div>
    {/each}
  </div>
{/if}

<style>
  .section-title.first { margin-top: 4px; } .thin { font-weight: 400; margin-left: 6px; font-size: 13px; }
  .list { padding: 4px 20px; overflow-x: auto; }
  .row { display: grid; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--hair-soft); align-items: center; font-size: 13.5px; }
  .row:last-child { border-bottom: 0; }
  .row.a { grid-template-columns: minmax(190px, 1.2fr) minmax(170px, 1.4fr) 100px 60px 120px 150px 150px; min-width: 1000px; }
  .row.p { grid-template-columns: minmax(200px, 1.3fr) 60px 100px 150px minmax(160px, 1.3fr) 150px; min-width: 880px; }
  .row.head { font-size: 12.5px; color: var(--text-muted); }
  .nm { display: flex; flex-direction: column; text-decoration: none; color: var(--text); } .nm span { font-weight: 500; } .nm:hover span { text-decoration: underline; }
  .nm code { font-family: var(--mono); font-size: 11.5px; color: var(--text-muted); }
  .row.off .nm span { color: var(--text-muted); text-decoration: line-through; }
  .mono { font-family: var(--mono); font-size: 12px; } .small { font-size: 12.5px; }
</style>
