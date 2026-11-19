<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { call, money } from '$lib/client';
  import { ui } from '$lib/ui.svelte';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import type { Entry } from '$lib/types';
  let { data } = $props();

  const filters = [
    { key: 'recommended', label: 'Recommended' },
    { key: 'asked', label: 'Asked' },
    { key: 'invalid', label: 'Invalid' },
    { key: 'approved', label: 'Sending' },
    { key: 'ready', label: 'Ready' }
  ];
  let hidden = $state<Set<string>>(new Set());
  let pulling = $state(false);
  let pullError = $state<{ message: string; source: string } | null>(null);

  const rows = $derived(data.all.filter((e) => e.state === data.state && !hidden.has(e.id)));
  const counts = $derived(Object.fromEntries(filters.map((f) => [f.key, data.all.filter((e) => e.state === f.key).length])));
  const invalidCount = $derived(counts.invalid ?? 0);

  $effect(() => { if (rows.length && !rows.some((r) => r.id === ui.selectedId)) ui.selectedId = rows[0].id; });

  async function pull() {
    pulling = true; pullError = null;
    try {
      const r = await call<{ pulled: number; newMerchants: number }>('entries.pull', { wait: true });
      ui.toast(`Pulled ${r.pulled} entries in review · ${r.newMerchants} new merchants`);
      await invalidateAll();
    } catch (e) { const err = e as { message: string; source?: string }; pullError = { message: err.message, source: err.source ?? 'app' }; }
    finally { pulling = false; }
  }

  async function approveRow(e: Entry) {
    if (!e.recommendation || e.recommendation.action !== 'code') { goto(`/entry/${e.id}`); return; }
    hidden = new Set([...hidden, e.id]); // optimistic: row fades within one frame
    try {
      await call('entry.approve', { id: e.id, yes: true, later: true });
      const acct = e.recommendation.lines.length > 1 ? `split (${e.recommendation.lines.length} lines)` : e.recommendation.lines[0].accountName;
      ui.toast(`Approved ${e.merchantName ?? e.description} → ${acct}`, {
        undo: async () => {
          await call('entry.undo', { id: e.id });
          hidden = new Set([...hidden].filter((x) => x !== e.id));
          await invalidateAll();
        }
      });
      await invalidateAll();
    } catch (err) {
      hidden = new Set([...hidden].filter((x) => x !== e.id));
      ui.toast((err as Error).message, { kind: 'error' });
    }
  }

  function onKey(ev: KeyboardEvent) {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLSelectElement || ui.paletteOpen || ev.metaKey || ev.ctrlKey) return;
    const i = rows.findIndex((r) => r.id === ui.selectedId);
    if (ev.key === 'j' || ev.key === 'ArrowDown') { ui.selectedId = rows[Math.min(i + 1, rows.length - 1)]?.id ?? null; ev.preventDefault(); }
    else if (ev.key === 'k' || ev.key === 'ArrowUp') { ui.selectedId = rows[Math.max(i - 1, 0)]?.id ?? null; ev.preventDefault(); }
    else if (ev.key === 'p') pull();
    else if (ev.key === 'a' && rows[i]) approveRow(rows[i]);
    else if ((ev.key === 'Enter' || ev.key === 'e' || ev.key === 'q') && rows[i]) goto(`/entry/${rows[i].id}`);
    else if (ev.key === 'u') { const t = [...ui.toasts].reverse().find((x) => x.undo); if (t) t.undo!().then(() => ui.dismiss(t.id)); }
  }
  const confClass = (c: number) => (c >= 0.9 ? 'hi' : c >= 0.75 ? 'mid' : 'lo');
  const acct = (e: Entry) => !e.recommendation ? '—' : e.recommendation.model.startsWith('off:') ? 'Manual (agent off)' : e.recommendation.action === 'ask' ? 'Question' : e.recommendation.lines.length > 1 ? `Split (${e.recommendation.lines.length} lines)` : e.recommendation.lines[0]?.accountName;
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>Queue · LaceLuxx Books</title></svelte:head>

<header>
  <h1>Review queue</h1>
  <span class="muted">{counts.recommended ?? 0} to review</span>
  <button class="btn dark" type="button" onclick={pull} disabled={pulling}>
    {#if pulling}<span class="spin" aria-hidden="true"></span> Pulling…{:else}Pull entries <span class="kbd">p</span>{/if}
  </button>
</header>

<div class="chips" role="tablist" aria-label="Filter by state">
  {#each filters as f}
    <a role="tab" aria-selected={data.state === f.key} class="chip" class:on={data.state === f.key} href="?state={f.key}" data-sveltekit-noscroll>{f.label} {counts[f.key] ?? 0}</a>
  {/each}
</div>

{#if pullError}<ErrorState message={pullError.message} source={pullError.source} onretry={pull} />{/if}

{#if data.error}
  <ErrorState message={data.error.message} source={data.error.source} onretry={() => invalidateAll()} />
{:else if pulling && !data.all.length}
  <div class="card table" aria-label="Loading">
    {#each Array(6) as _}<div class="skeleton" style="height: 30px; margin: 12px 16px;"></div>{/each}
  </div>
{:else if !rows.length}
  <div class="card empty">
    <p class="big">{data.state === 'recommended' ? 'Nothing to review.' : `No ${filters.find((f) => f.key === data.state)?.label.toLowerCase()} entries.`}</p>
    <p class="muted">{data.all.length ? `${data.all.length} entries in other states.` : 'No entries pulled yet.'}</p>
    {#if data.state === 'recommended'}<button class="btn dark" type="button" onclick={pull}>Pull entries</button>{/if}
  </div>
{:else}
  {#if data.state === 'recommended' && invalidCount}
    <p class="partial"><a href="?state=invalid">{invalidCount} entr{invalidCount === 1 ? 'y' : 'ies'} failed validation</a> — the rest are usable.</p>
  {/if}
  <div class="card table">
    <div class="row head" role="row">
      <span>Date</span><span>Merchant</span><span class="r">Amount</span><span>Account</span><span>Conf</span><span class="why">Why</span><span></span>
    </div>
    {#each rows as e (e.id)}
      <div class="row" role="row" class:sel={ui.selectedId === e.id} class:ask={e.recommendation?.action === 'ask' || e.state === 'asked'} class:bad={e.state === 'invalid'}
        tabindex="0" onfocus={() => (ui.selectedId = e.id)} onclick={() => (ui.selectedId = e.id)} ondblclick={() => goto(`/entry/${e.id}`)}
        onkeydown={(ev) => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) { ev.stopPropagation(); goto(`/entry/${e.id}`); } }} aria-selected={ui.selectedId === e.id}>
        <span class="mono muted">{e.date}</span>
        <a class="merchant" href="/entry/{e.id}">{e.merchantName ?? e.description}</a>
        <span class="r mono" class:credit={e.amountCents > 0}>{money(e.amountCents)}</span>
        <span>{acct(e)}</span>
        <span class="mono {e.recommendation ? confClass(e.recommendation.confidence) : ''}">{e.recommendation?.confidence.toFixed(2) ?? ''}</span>
        <span class="why muted">{e.state === 'invalid' ? e.stateReason : e.recommendation?.action === 'ask' ? e.recommendation.question : e.recommendation?.reasoning}</span>
        <span class="act">
          {#if e.state === 'recommended' && e.recommendation?.action === 'code'}
            <button class="btn sm primary" type="button" onclick={(ev) => { ev.stopPropagation(); approveRow(e); }}>Approve <span class="kbd">a</span></button>
          {:else if e.state === 'recommended' || e.state === 'asked'}
            <a class="btn sm warn" href="/entry/{e.id}">{e.state === 'asked' ? 'Asked' : e.recommendation?.model.startsWith('off:') ? 'Code' : 'Answer'}</a>
          {:else if e.state === 'invalid'}
            <a class="btn sm" href="/entry/{e.id}">Fix</a>
          {:else}
            <span class="muted small">{e.state}</span>
          {/if}
        </span>
      </div>
    {/each}
  </div>
  <p class="muted small hint">j / k move · a approve · Enter open · p pull · u undo · ⌘K commands</p>
{/if}

<style>
  header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
  h1 { margin: 0; font-size: 22px; font-weight: 600; }
  header .btn { margin-left: auto; }
  .chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
  .chip { display: inline-flex; align-items: center; text-decoration: none; }
  .table { overflow-x: auto; }
  .row { display: grid; grid-template-columns: 96px minmax(140px, 1.3fr) 104px minmax(140px, 1.3fr) 56px minmax(180px, 2fr) 116px; gap: 12px; padding: 11px 16px; align-items: center; border-bottom: 1px solid var(--line-soft); min-width: 920px; cursor: default; }
  .row.head { font-size: 12px; font-weight: 500; color: var(--muted); background: var(--muted-surface); border-bottom-color: var(--line); }
  .row.sel { box-shadow: inset 3px 0 0 var(--accent); background: var(--accent-soft); }
  .row.ask { background: var(--warn-soft); }
  .row.bad { background: var(--danger-soft); box-shadow: inset 3px 0 0 var(--danger); }
  .r { text-align: right; }
  .merchant { font-weight: 500; color: var(--ink); text-decoration: none; }
  .merchant:hover { text-decoration: underline; }
  .credit { color: var(--ok); }
  .hi { color: var(--ok); } .mid { color: var(--ink-2); } .lo { color: var(--warn); }
  .why { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .act { display: flex; justify-content: flex-end; }
  .empty { padding: 56px 24px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .big { font-size: 16px; font-weight: 500; margin: 0; }
  .empty p { margin: 0; }
  .partial { margin: 0 0 10px; font-size: 13px; color: var(--danger); }
  .small { font-size: 12px; }
  .hint { margin-top: 10px; }
  .spin { width: 12px; height: 12px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
