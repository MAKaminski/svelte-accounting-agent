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
<svelte:head><title>Rules · LaceLuxx Books</title></svelte:head>
<h1>Learned rules</h1>
<p class="muted lead">After 3 approvals of the same merchant to the same account with no conflicts, the agent proposes a Slash mapping. Applying it makes Slash code that merchant automatically — no model call.</p>
{#if data.error}
  <ErrorState message={data.error.message} source={data.error.source} onretry={() => invalidateAll()} />
{:else if !data.mappings.length}
  <div class="card empty"><p class="big">No rules yet.</p><p class="muted">Approve a few entries from the same merchant and a rule will appear here.</p></div>
{:else}
  <div class="card list">
    {#each [...proposed, ...other] as m (m.id)}
      <div class="row">
        <span class="label">{m.sourceLabel}</span><span>→ {m.accountName}</span><span class="muted">{m.supportCount} approvals</span>
        <span class="status {m.status}">{m.status}</span>
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
  h1 { margin: 0 0 6px; font-size: 22px; } .lead { margin: 0 0 16px; max-width: 70ch; }
  .list { padding: 4px 16px; overflow-x: auto; }
  .row { display: grid; grid-template-columns: minmax(140px, 1.2fr) minmax(160px, 1.2fr) 110px 90px 150px; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--line-soft); min-width: 680px; }
  .label { font-weight: 500; }
  .status { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; } .status.applied { color: var(--ok); } .status.dismissed { color: var(--muted); } .status.proposed { color: var(--accent); }
  .empty { padding: 48px; text-align: center; } .big { font-size: 16px; font-weight: 500; margin: 0 0 6px; } .empty p { margin: 0; }
  .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / .3); z-index: 40; }
  .dialog { position: fixed; top: 20vh; left: 50%; transform: translateX(-50%); width: min(480px, calc(100vw - 32px)); padding: 22px; z-index: 41; display: flex; flex-direction: column; gap: 12px; }
  .dialog h2 { margin: 0; font-size: 17px; } .dialog p { margin: 0; } .acts { display: flex; gap: 8px; }
</style>
