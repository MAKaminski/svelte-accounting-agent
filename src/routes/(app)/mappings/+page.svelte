<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { call } from '$lib/client';
  import { ui } from '$lib/ui.svelte';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import type { MappingProposal } from '$lib/types';
  let { data } = $props();
  let confirming = $state<MappingProposal | null>(null);
  let busy = $state(false);
  const proposed = $derived(data.mappings.filter((m) => m.status === 'proposed'));
  const other = $derived(data.mappings.filter((m) => m.status !== 'proposed'));

  async function apply() {
    if (!confirming) return;
    busy = true;
    try { await call('mapping.apply', { id: confirming.id, yes: true }); ui.toast(`Rule applied in Slash: ${confirming.sourceLabel} → ${confirming.accountName}`); confirming = null; await invalidateAll(); }
    catch (e) { ui.toast((e as Error).message, { kind: 'error' }); }
    finally { busy = false; }
  }
  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'r' && proposed[0] && !confirming && !(ev.target instanceof HTMLInputElement) && !ui.paletteOpen) confirming = proposed[0];
    if (ev.key === 'Escape') confirming = null;
  }
</script>
<svelte:window onkeydown={onKey} />
<svelte:head><title>Rules · Accounting Agent</title></svelte:head>
<header class="page-head"><div><h1>Learned rules</h1><p class="sub">After three approvals of the same merchant to the same account, the agent proposes a rule. Once applied, that merchant is coded automatically with no model call.</p></div></header>
{#if data.error}
  <ErrorState message={data.error.message} source={data.error.source} onretry={() => invalidateAll()} />
{:else if !data.mappings.length}
  <div class="card empty-state"><span class="ring" aria-hidden="true">↻</span><p class="big">No rules yet.</p><p class="muted">Approve a few entries from the same merchant and a rule will appear here.</p></div>
{:else}
  <div class="card list">
    {#each [...proposed, ...other] as m (m.id)}
      <div class="row">
        <span class="label">{m.sourceLabel}</span><span>→ {m.accountName}</span><span class="muted">{m.supportCount} approvals</span>
        <span><span class="pill" class:accent={m.status === 'proposed'} class:ok={m.status === 'applied'}>{m.status === 'proposed' ? 'Proposed' : m.status === 'applied' ? 'Applied' : 'Dismissed'}</span></span>
        {#if m.status === 'proposed'}<button class="btn sm primary" type="button" onclick={() => (confirming = m)}>Apply in Slash <span class="kbd">r</span></button>{:else}<span></span>{/if}
      </div>
    {/each}
  </div>
{/if}
{#if confirming}
  <div class="backdrop" role="presentation" onclick={() => (confirming = null)}></div>
  <div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
    <h2 id="dlg-title">Apply this rule in Slash?</h2>
    <p>Slash will code every <strong>{confirming.sourceLabel}</strong> transaction to <strong>{confirming.accountName}</strong>, including entries still in review.</p>
    <div class="acts"><button class="btn primary" type="button" onclick={apply} disabled={busy}>{busy ? 'Applying…' : 'Apply rule'}</button><button class="btn" type="button" onclick={() => (confirming = null)}>Cancel</button></div>
  </div>
{/if}
<style>
  .list { padding: 4px 20px; overflow-x: auto; }
  .row { display: grid; grid-template-columns: minmax(140px, 1.2fr) minmax(160px, 1.2fr) 110px 110px 160px; gap: 14px; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--hair-soft); min-width: 700px; }
  .row:last-child { border-bottom: 0; }
  .label { font-weight: 500; }
  .acts { display: flex; gap: 8px; margin-top: 4px; }
</style>
